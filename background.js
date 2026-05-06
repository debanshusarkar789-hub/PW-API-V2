/**
 * Advanced API Capture - Background Service Worker
 * Manifest V3 - Captures all network traffic using chrome.webRequest API
 * Combined with content script for request/response body capture
 */

/* ============================================================
   CONSTANTS & DEFAULTS
   ============================================================ */
const STORAGE_KEY = 'api_capture_entries';
const SETTINGS_KEY = 'api_capture_settings';
const STATE_KEY = 'api_capture_state';
const BODY_CACHE_KEY = 'api_capture_bodies';

const DEFAULT_SETTINGS = {
  maxEntries: 10000,
  autoExport: false,
  captureHeaders: true,
  captureBodies: true,
  highlightErrors: true,
  showNotifications: false,
  playSoundOnError: false,
  theme: 'dark'
};

const DEFAULT_STATE = {
  isCapturing: true,
  captureMode: 'all', // 'all', 'domains', 'regex'
  targetDomains: [],
  customRegex: [],
  stats: {
    totalEntries: 0,
    totalRequests: 0,
    totalResponses: 0,
    totalErrors: 0,
    storageSizeKB: 0
  }
};

/* ============================================================
   UTILITIES (available in service worker context)
   ============================================================ */

/**
 * Get byte length of a UTF-8 string (replaces Blob for service worker)
 */
function byteLength(str) {
  if (!str) return 0;
  return new TextEncoder().encode(str).length;
}

/* ============================================================
   STATE MANAGEMENT
   ============================================================ */

let isCapturing = true;
let captureMode = 'all';
let targetDomains = [];
let customRegex = [];
let settings = { ...DEFAULT_SETTINGS };
let stats = { ...DEFAULT_STATE.stats };
let pendingRequests = new Map(); // requestId -> partial data
let bodyCache = new Map(); // requestId -> { requestBody, responseBody }

/**
 * Initialize state from chrome.storage on service worker startup
 */
async function initState() {
  try {
    const [stateResult, settingsResult] = await Promise.all([
      chrome.storage.local.get(STATE_KEY),
      chrome.storage.local.get(SETTINGS_KEY)
    ]);

    if (stateResult[STATE_KEY]) {
      isCapturing = stateResult[STATE_KEY].isCapturing !== false;
      captureMode = stateResult[STATE_KEY].captureMode || 'all';
      targetDomains = stateResult[STATE_KEY].targetDomains || [];
      customRegex = stateResult[STATE_KEY].customRegex || [];
      stats = stateResult[STATE_KEY].stats || { ...DEFAULT_STATE.stats };
    }

    if (settingsResult[SETTINGS_KEY]) {
      settings = { ...DEFAULT_SETTINGS, ...settingsResult[SETTINGS_KEY] };
    }

    // Recalculate stats from stored entries
    await recalculateStats();
  } catch (err) {
    console.error('[API Capture] Failed to init state:', err);
  }
}

/**
 * Save current state to chrome.storage
 */
async function saveState() {
  try {
    await chrome.storage.local.set({
      [STATE_KEY]: {
        isCapturing,
        captureMode,
        targetDomains,
        customRegex,
        stats
      }
    });
  } catch (err) {
    console.error('[API Capture] Failed to save state:', err);
  }
}

/**
 * Save settings to chrome.storage
 */
async function saveSettings(newSettings) {
  settings = { ...DEFAULT_SETTINGS, ...newSettings };
  try {
    await chrome.storage.local.set({
      [SETTINGS_KEY]: settings
    });
  } catch (err) {
    console.error('[API Capture] Failed to save settings:', err);
  }
}

/**
 * Recalculate statistics from stored entries
 */
async function recalculateStats() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const entries = result[STORAGE_KEY] || [];

    stats.totalEntries = entries.length;
    stats.totalRequests = entries.filter(e => e.statusCode).length;
    stats.totalResponses = entries.filter(e => e.responseBody).length;
    stats.totalErrors = entries.filter(e => e.error).length;

    // Estimate storage size (Blob not available in service worker)
    const dataStr = JSON.stringify(entries);
    stats.storageSizeKB = Math.round(byteLength(dataStr) / 1024);

    await saveState();
  } catch (err) {
    console.error('[API Capture] Failed to recalculate stats:', err);
  }
}

/* ============================================================
   CAPTURE FILTERING
   ============================================================ */

/**
 * Check if a URL should be captured based on current mode
 */
function shouldCapture(url) {
  if (!url || !isCapturing) return false;

  try {
    const urlObj = new URL(url);

    switch (captureMode) {
      case 'all':
        return true;

      case 'domains':
        if (targetDomains.length === 0) return false;
        return targetDomains.some(domain => {
          const cleanDomain = domain.trim().toLowerCase();
          if (!cleanDomain) return false;
          // Match exact domain or subdomain
          return urlObj.hostname === cleanDomain ||
                 urlObj.hostname.endsWith('.' + cleanDomain);
        });

      case 'regex':
        if (customRegex.length === 0) return false;
        return customRegex.some(pattern => {
          try {
            const regex = new RegExp(pattern.trim(), 'i');
            return regex.test(url);
          } catch (e) {
            return false;
          }
        });

      default:
        return true;
    }
  } catch (e) {
    return false;
  }
}

/* ============================================================
   ENTRY CREATION & STORAGE
   ============================================================ */

/**
 * Generate a unique request ID
 */
function generateId() {
  return 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
}

/**
 * Get domain from URL
 */
function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return 'unknown';
  }
}

/**
 * Create a new entry from webRequest data
 */
function createEntry(requestId, details) {
  const now = new Date();
  return {
    id: generateId(),
    chromeRequestId: requestId,
    tabId: details.tabId ?? -1,
    frameId: details.frameId ?? 0,
    url: details.url || '',
    method: details.method || 'GET',
    type: details.type || 'other',
    domain: getDomain(details.url),

    // Request details
    requestHeaders: details.requestHeaders ? headersToObject(details.requestHeaders) : {},
    requestBody: '',
    timestamp: now.toISOString(),
    unixTimestamp: now.getTime(),

    // Response details (filled in later)
    statusCode: null,
    statusText: '',
    responseHeaders: {},
    responseBody: '',
    responseSize: 0,
    contentType: '',
    fromCache: details.fromCache || false,
    serverIP: '',

    // Error
    error: null,

    // Timing
    startTime: details.timeStamp ? new Date(details.timeStamp).toISOString() : now.toISOString(),
    endTime: null,
    duration: 0,

    // Meta
    captured: true
  };
}

/**
 * Convert chrome header array to object
 */
function headersToObject(headers) {
  const obj = {};
  if (!headers || !Array.isArray(headers)) return obj;
  for (const h of headers) {
    if (h.name && h.value !== undefined) {
      // Handle duplicate headers by combining with comma
      const key = h.name.toLowerCase();
      if (obj[key]) {
        obj[key] = obj[key] + ', ' + h.value;
      } else {
        obj[key] = h.value;
      }
    }
  }
  return obj;
}

/**
 * Get a header value from headers object
 */
function getHeaderValue(headers, name) {
  if (!headers) return '';
  return headers[name.toLowerCase()] || '';
}

/**
 * Store an entry in chrome.storage.local
 */
async function storeEntry(entry) {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    let entries = result[STORAGE_KEY] || [];

    entries.push(entry);

    // Enforce max entries limit
    if (entries.length > settings.maxEntries) {
      const excess = entries.length - settings.maxEntries;
      entries = entries.slice(excess);
    }

    await chrome.storage.local.set({ [STORAGE_KEY]: entries });

    // Update stats
    stats.totalEntries = entries.length;
    stats.totalRequests = entries.filter(e => e.statusCode !== null).length;
    stats.totalResponses = entries.filter(e => e.responseBody).length;
    stats.totalErrors = entries.filter(e => e.error).length;

    const dataStr = JSON.stringify(entries);
    stats.storageSizeKB = Math.round(byteLength(dataStr) / 1024);

    await saveState();

    // Check if we should show notification
    if (settings.showNotifications && entry.statusCode) {
      showNotification(entry);
    }

    return true;
  } catch (err) {
    console.error('[API Capture] Failed to store entry:', err);
    return false;
  }
}

/**
 * Update an existing entry by chromeRequestId
 */
async function updateEntry(chromeRequestId, updates) {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    let entries = result[STORAGE_KEY] || [];

    const index = entries.findIndex(e => e.chromeRequestId === chromeRequestId);
    if (index === -1) return false;

    entries[index] = { ...entries[index], ...updates };
    await chrome.storage.local.set({ [STORAGE_KEY]: entries });

    // Recalculate stats
    stats.totalResponses = entries.filter(e => e.responseBody).length;
    stats.totalErrors = entries.filter(e => e.error).length;

    await saveState();

    return true;
  } catch (err) {
    console.error('[API Capture] Failed to update entry:', err);
    return false;
  }
}

/**
 * Show browser notification for captured request
 */
function showNotification(entry) {
  try {
    const method = entry.method || 'GET';
    const status = entry.statusCode || 'N/A';
    const url = entry.url?.substring(0, 100) || 'Unknown URL';

    chrome.notifications?.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: `API Capture: ${method} ${status}`,
      message: url
    });
  } catch (e) {
    // Notifications API might not be available
  }
}

/* ============================================================
   WEBREQUEST LISTENERS
   ============================================================ */

/**
 * On before request - capture initial request data
 */
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!shouldCapture(details.url)) return;

    const entry = createEntry(details.requestId, details);

    // Extract request body if available
    if (details.requestBody) {
      try {
        if (details.requestBody.raw && details.requestBody.raw.length > 0) {
          // Decode raw body array
          const decoder = new TextDecoder('utf-8');
          entry.requestBody = details.requestBody.raw
            .map(part => decoder.decode(part.bytes || new Uint8Array(0)))
            .join('');
        } else if (details.requestBody.formData) {
          entry.requestBody = JSON.stringify(details.requestBody.formData);
        } else {
          entry.requestBody = details.requestBody.error || '';
        }
      } catch (e) {
        entry.requestBody = '[Error decoding request body]';
      }
    }

    // Store in pending map for correlation
    pendingRequests.set(details.requestId, entry);

    // Also store directly
    storeEntry(entry);
  },
  { urls: ['<all_urls>'] },
  ['requestBody']
);

/**
 * On send headers - capture request headers
 */
chrome.webRequest.onSendHeaders.addListener(
  (details) => {
    if (!shouldCapture(details.url)) return;

    if (settings.captureHeaders) {
      const entry = pendingRequests.get(details.requestId);
      if (entry) {
        entry.requestHeaders = headersToObject(details.requestHeaders || []);
        updateEntry(details.requestId, {
          requestHeaders: entry.requestHeaders
        });
      }
    }
  },
  { urls: ['<all_urls>'] },
  ['requestHeaders']
);

/**
 * On headers received - capture response headers and status
 */
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (!shouldCapture(details.url)) return;

    const entry = pendingRequests.get(details.requestId);
    if (!entry) return;

    const responseHeaders = settings.captureHeaders
      ? headersToObject(details.responseHeaders || [])
      : {};

    const contentType = getHeaderValue(responseHeaders, 'content-type');
    const fromCache = details.fromCache || false;

    const updates = {
      statusCode: details.statusCode || 0,
      statusText: details.statusLine || '',
      responseHeaders,
      contentType: contentType.split(';')[0]?.trim() || '',
      fromCache
    };

    updateEntry(details.requestId, updates);

    // Keep in pending for completion/error
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

/**
 * On completed - mark request as completed
 */
chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (!shouldCapture(details.url)) return;

    const entry = pendingRequests.get(details.requestId);
    if (!entry) return;

    const now = new Date();
    const startTime = new Date(entry.unixTimestamp);
    const duration = now.getTime() - startTime.getTime();

    const updates = {
      endTime: now.toISOString(),
      duration: Math.round(duration)
    };

    // Check for response body from content script
    const bodyData = bodyCache.get(details.requestId);
    if (bodyData) {
      if (bodyData.requestBody) updates.requestBody = bodyData.requestBody;
      if (bodyData.responseBody) updates.responseBody = bodyData.responseBody;
      updates.responseSize = bodyData.responseBody ? byteLength(bodyData.responseBody) : 0;
      bodyCache.delete(details.requestId);
    }

    updateEntry(details.requestId, updates);
    pendingRequests.delete(details.requestId);
  },
  { urls: ['<all_urls>'] }
);

/**
 * On error occurred - capture error information
 */
chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    if (!shouldCapture(details.url)) return;

    const entry = pendingRequests.get(details.requestId);

    const now = new Date();
    const startTime = entry ? new Date(entry.unixTimestamp) : now;
    const duration = now.getTime() - startTime.getTime();

    const updates = {
      error: details.error || 'Unknown error',
      endTime: now.toISOString(),
      duration: Math.round(duration),
      statusCode: 0,
      statusText: 'Error'
    };

    // Check for response body from content script
    const bodyData = bodyCache.get(details.requestId);
    if (bodyData) {
      if (bodyData.requestBody) updates.requestBody = bodyData.requestBody;
      if (bodyData.responseBody) updates.responseBody = bodyData.responseBody;
      bodyCache.delete(details.requestId);
    }

    if (entry) {
      updateEntry(details.requestId, updates);
      pendingRequests.delete(details.requestId);
    } else {
      // Create error entry directly
      const errorEntry = createEntry(details.requestId, details);
      Object.assign(errorEntry, updates);
      storeEntry(errorEntry);
    }
  },
  { urls: ['<all_urls>'] }
);

/* ============================================================
   MESSAGE HANDLERS (from popup, options, content scripts)
   ============================================================ */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle async responses
  handleMessage(message, sender).then(sendResponse).catch(err => {
    console.error('[API Capture] Message handler error:', err);
    sendResponse({ error: err.message });
  });

  // Return true to indicate we'll call sendResponse asynchronously
  return true;
});

async function handleMessage(message, sender) {
  switch (message.action) {
    // ---- State & Stats ----
    case 'getState':
      return {
        isCapturing,
        captureMode,
        targetDomains,
        customRegex,
        stats
      };

    case 'toggleCapture':
      isCapturing = !isCapturing;
      await saveState();
      return { isCapturing };

    case 'setCaptureMode':
      captureMode = message.mode || 'all';
      await saveState();
      return { captureMode };

    case 'setTargetDomains':
      targetDomains = (message.domains || [])
        .split('\n')
        .map(d => d.trim())
        .filter(d => d.length > 0);
      captureMode = 'domains';
      await saveState();
      return { captureMode, targetDomains };

    case 'setCustomRegex':
      customRegex = (message.patterns || [])
        .split('\n')
        .map(p => p.trim())
        .filter(p => p.length > 0);
      captureMode = 'regex';
      await saveState();
      return { captureMode, customRegex };

    // ---- Entries ----
    case 'getEntries':
      return await getFilteredEntries(message.filters || {});

    case 'getEntry':
      return await getEntryById(message.id);

    case 'clearAll':
      return await clearAllData();

    case 'deleteEntry':
      return await deleteEntry(message.id);

    // ---- Settings ----
    case 'getSettings':
      return settings;

    case 'saveSettings':
      await saveSettings(message.settings);
      return { success: true, settings };

    case 'resetSettings':
      settings = { ...DEFAULT_SETTINGS };
      await saveSettings(settings);
      return { success: true, settings };

    // ---- Export ----
    case 'exportData':
      return await exportData(message.format, message.filters);

    case 'getStats':
      return stats;

    // ---- Content Script Body Injection ----
    case 'captureBody':
      // Content script sends captured request/response bodies
      if (message.requestId && (message.requestBody || message.responseBody)) {
        if (!bodyCache.has(message.requestId)) {
          bodyCache.set(message.requestId, {});
        }
        const cache = bodyCache.get(message.requestId);
        if (message.requestBody) cache.requestBody = message.requestBody;
        if (message.responseBody) cache.responseBody = message.responseBody;
        return { received: true };
      }
      return { received: false };

    default:
      return { error: 'Unknown action: ' + message.action };
  }
}

/* ============================================================
   DATA OPERATIONS
   ============================================================ */

/**
 * Get entries with optional filtering
 */
async function getFilteredEntries(filters = {}) {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    let entries = result[STORAGE_KEY] || [];

    // Search filter
    if (filters.search) {
      const search = filters.search.toLowerCase();
      entries = entries.filter(e =>
        (e.url && e.url.toLowerCase().includes(search)) ||
        (e.method && e.method.toLowerCase().includes(search)) ||
        (e.domain && e.domain.toLowerCase().includes(search)) ||
        (e.responseBody && e.responseBody.toLowerCase().includes(search)) ||
        (e.requestBody && e.requestBody.toLowerCase().includes(search))
      );
    }

    // Type filter
    if (filters.type && filters.type !== 'all') {
      switch (filters.type) {
        case 'requests':
          entries = entries.filter(e => e.statusCode !== null && e.statusCode > 0);
          break;
        case 'responses':
          entries = entries.filter(e => e.responseBody && e.responseBody.length > 0);
          break;
        case 'errors':
          entries = entries.filter(e => e.error);
          break;
      }
    }

    // Status filter
    if (filters.status && filters.status !== 'all') {
      const statusCode = parseInt(filters.status);
      if (!isNaN(statusCode)) {
        if (filters.status.startsWith('2')) {
          entries = entries.filter(e => e.statusCode >= 200 && e.statusCode < 300);
        } else if (filters.status.startsWith('3')) {
          entries = entries.filter(e => e.statusCode >= 300 && e.statusCode < 400);
        } else if (filters.status.startsWith('4')) {
          entries = entries.filter(e => e.statusCode >= 400 && e.statusCode < 500);
        } else if (filters.status.startsWith('5')) {
          entries = entries.filter(e => e.statusCode >= 500 && e.statusCode < 600);
        } else {
          entries = entries.filter(e => e.statusCode === statusCode);
        }
      }
    }

    // Domain filter
    if (filters.domain) {
      const domain = filters.domain.toLowerCase();
      entries = entries.filter(e =>
        e.domain && e.domain.toLowerCase().includes(domain)
      );
    }

    // Method filter
    if (filters.method) {
      entries = entries.filter(e =>
        e.method && e.method.toUpperCase() === filters.method.toUpperCase()
      );
    }

    // Sort by timestamp (newest first)
    entries.sort((a, b) => b.unixTimestamp - a.unixTimestamp);

    // Pagination
    const page = filters.page || 1;
    const limit = filters.limit || 100;
    const offset = (page - 1) * limit;

    return {
      entries: entries.slice(offset, offset + limit),
      total: entries.length,
      page,
      limit,
      totalPages: Math.ceil(entries.length / limit)
    };
  } catch (err) {
    console.error('[API Capture] Failed to get entries:', err);
    return { entries: [], total: 0, error: err.message };
  }
}

/**
 * Get a single entry by ID
 */
async function getEntryById(id) {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const entries = result[STORAGE_KEY] || [];
    return entries.find(e => e.id === id) || null;
  } catch (err) {
    console.error('[API Capture] Failed to get entry:', err);
    return null;
  }
}

/**
 * Delete a single entry
 */
async function deleteEntry(id) {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    let entries = result[STORAGE_KEY] || [];
    entries = entries.filter(e => e.id !== id);
    await chrome.storage.local.set({ [STORAGE_KEY]: entries });
    await recalculateStats();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Clear all captured data
 */
async function clearAllData() {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: [] });
    pendingRequests.clear();
    bodyCache.clear();
    stats = { totalEntries: 0, totalRequests: 0, totalResponses: 0, totalErrors: 0, storageSizeKB: 0 };
    await saveState();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/* ============================================================
   EXPORT (delegates to lib/export.js via importScripts)
   ============================================================ */

// Since we're a service worker with type: module, we import the export library
// We'll handle export logic inline since dynamic imports from file:// are limited
async function exportData(format, filters = {}) {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    let entries = result[STORAGE_KEY] || [];

    // Apply filters if provided
    if (filters.search) {
      const search = filters.search.toLowerCase();
      entries = entries.filter(e =>
        (e.url && e.url.toLowerCase().includes(search)) ||
        (e.responseBody && e.responseBody.toLowerCase().includes(search))
      );
    }
    if (filters.status) {
      const statusCode = parseInt(filters.status);
      if (!isNaN(statusCode)) {
        entries = entries.filter(e => e.statusCode === statusCode);
      }
    }

    let content = '';
    let filename = '';
    let mimeType = 'text/plain';

    switch (format) {
      case 'json':
        content = JSON.stringify({
          metadata: {
            name: 'Advanced API Capture',
            version: '3.0.0',
            exportedAt: new Date().toISOString(),
            totalEntries: entries.length,
            filters: filters || {}
          },
          entries
        }, null, 2);
        filename = `api-capture-${Date.now()}.json`;
        mimeType = 'application/json';
        break;

      case 'csv':
        content = exportToCSV(entries);
        filename = `api-capture-${Date.now()}.csv`;
        mimeType = 'text/csv';
        break;

      case 'har':
        content = exportToHAR(entries);
        filename = `api-capture-${Date.now()}.har`;
        mimeType = 'application/json';
        break;

      case 'ndjson':
        content = entries.map(e => JSON.stringify(e)).join('\n');
        filename = `api-capture-${Date.now()}.ndjson`;
        mimeType = 'application/x-ndjson';
        break;

      case 'sql':
        content = exportToSQL(entries);
        filename = `api-capture-${Date.now()}.sql`;
        mimeType = 'text/x-sql';
        break;

      case 'markdown':
        content = exportToMarkdown(entries);
        filename = `api-capture-${Date.now()}.md`;
        mimeType = 'text/markdown';
        break;

      default:
        return { error: 'Unknown format: ' + format };
    }

    // Download the file using data URI (URL.createObjectURL unavailable in service worker)
    const dataUri = `data:${mimeType};base64,${btoa(unescape(encodeURIComponent(content)))}`;

    await chrome.downloads.download({
      url: dataUri,
      filename: filename,
      saveAs: true
    });

    return { success: true, format, entryCount: entries.length, filename };
  } catch (err) {
    console.error('[API Capture] Export failed:', err);
    return { success: false, error: err.message };
  }
}

/* ============================================================
   EXPORT FORMAT HELPERS
   ============================================================ */

function exportToCSV(entries) {
  const headers = [
    'id', 'method', 'url', 'statusCode', 'statusText', 'domain',
    'contentType', 'fromCache', 'error', 'duration',
    'timestamp', 'requestBody', 'responseBody', 'responseSize'
  ];

  const rows = entries.map(e => [
    csvEscape(e.id || ''),
    csvEscape(e.method || ''),
    csvEscape(e.url || ''),
    e.statusCode ?? '',
    csvEscape(e.statusText || ''),
    csvEscape(e.domain || ''),
    csvEscape(e.contentType || ''),
    e.fromCache ? 'true' : 'false',
    csvEscape(e.error || ''),
    e.duration ?? '',
    csvEscape(e.timestamp || ''),
    csvEscape(truncate(e.requestBody, 5000)),
    csvEscape(truncate(e.responseBody, 5000)),
    e.responseSize || 0
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

function csvEscape(str) {
  if (!str) return '""';
  const s = String(str).replace(/"/g, '""');
  return `"${s}"`;
}

function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
}

function exportToHAR(entries) {
  const harEntries = entries.map(e => ({
    startedDateTime: e.timestamp || new Date().toISOString(),
    time: e.duration || 0,
    request: {
      method: e.method || 'GET',
      url: e.url || '',
      httpVersion: 'HTTP/1.1',
      cookies: [],
      headers: Object.entries(e.requestHeaders || {}).map(([name, value]) => ({
        name, value
      })),
      queryString: (() => {
        try {
          const urlObj = new URL(e.url || '');
          return Array.from(urlObj.searchParams.entries()).map(([name, value]) => ({
            name, value
          }));
        } catch {
          return [];
        }
      })(),
      postData: e.requestBody ? {
        mimeType: e.requestHeaders?.['content-type'] || 'application/octet-stream',
        text: e.requestBody
      } : undefined,
      headersSize: -1,
      bodySize: e.requestBody ? byteLength(e.requestBody) : 0
    },
    response: {
      status: e.statusCode || 0,
      statusText: e.statusText || '',
      httpVersion: 'HTTP/1.1',
      cookies: [],
      headers: Object.entries(e.responseHeaders || {}).map(([name, value]) => ({
        name, value
      })),
      content: {
        size: e.responseSize || 0,
        mimeType: e.contentType || '',
        text: e.responseBody || ''
      },
      redirectURL: '',
      headersSize: -1,
      bodySize: e.responseSize || 0
    },
    cache: e.fromCache ? {} : undefined,
    timings: {
      send: 0,
      wait: e.duration || 0,
      receive: 0
    }
  }));

  return JSON.stringify({
    log: {
      version: '1.2',
      creator: {
        name: 'Advanced API Capture',
        version: '3.0.0'
      },
      entries: harEntries
    }
  }, null, 2);
}

function exportToSQL(entries) {
  const lines = [
    '-- Advanced API Capture - SQL Export',
    '-- Generated: ' + new Date().toISOString(),
    '-- Total entries: ' + entries.length,
    '',
    'CREATE TABLE IF NOT EXISTS api_capture (',
    '  id TEXT PRIMARY KEY,',
    '  method TEXT,',
    '  url TEXT,',
    '  status_code INTEGER,',
    '  status_text TEXT,',
    '  domain TEXT,',
    '  content_type TEXT,',
    '  from_cache INTEGER,',
    '  error TEXT,',
    '  duration INTEGER,',
    '  timestamp TEXT,',
    '  request_body TEXT,',
    '  response_body TEXT,',
    '  response_size INTEGER',
    ');',
    ''
  ];

  for (const e of entries) {
    const values = [
      sqlEscape(e.id),
      sqlEscape(e.method),
      sqlEscape(e.url),
      e.statusCode ?? 'NULL',
      sqlEscape(e.statusText),
      sqlEscape(e.domain),
      sqlEscape(e.contentType),
      e.fromCache ? '1' : '0',
      sqlEscape(e.error),
      e.duration ?? 'NULL',
      sqlEscape(e.timestamp),
      sqlEscape(truncate(e.requestBody, 10000)),
      sqlEscape(truncate(e.responseBody, 10000)),
      e.responseSize || 0
    ];
    lines.push(`INSERT INTO api_capture VALUES (${values.join(', ')});`);
  }

  return lines.join('\n');
}

function sqlEscape(str) {
  if (!str && str !== '') return 'NULL';
  return "'" + String(str).replace(/'/g, "''") + "'";
}

function exportToMarkdown(entries) {
  const displayEntries = entries.slice(0, 100);
  const lines = [
    '# API Capture Export',
    '',
    `**Generated:** ${new Date().toISOString()}`,
    `**Total Entries:** ${entries.length}`,
    `**Showing:** First ${displayEntries.length} entries`,
    '',
    '| # | Method | Status | URL | Domain | Type | Duration | Time |',
    '|---|--------|--------|-----|--------|------|----------|------|'
  ];

  displayEntries.forEach((e, i) => {
    const shortUrl = (e.url || '').substring(0, 60);
    lines.push(
      `| ${i + 1} | ${e.method || '-'} | ${e.statusCode || '-'} | ${shortUrl} | ${e.domain || '-'} | ${e.contentType || '-'} | ${e.duration || '-'}ms | ${e.timestamp || '-'} |`
    );
  });

  if (entries.length > 100) {
    lines.push('', `> ... and ${entries.length - 100} more entries`);
  }

  return lines.join('\n');
}

/* ============================================================
   TAB LIFECYCLE MANAGEMENT
   ============================================================ */

// Clean up pending requests when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  for (const [requestId, entry] of pendingRequests) {
    if (entry.tabId === tabId) {
      pendingRequests.delete(requestId);
      bodyCache.delete(requestId);
    }
  }
});

/* ============================================================
   SERVICE WORKER LIFECYCLE
   ============================================================ */

// Initialize on startup
initState();

// Keep service worker alive for extended periods
chrome.alarms?.create('keepAlive', { periodInMinutes: 0.5 });
chrome.alarms?.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    // Just wake up the service worker
  }
});

// Log startup
console.log('[API Capture] Background service worker started v3.0.0');
