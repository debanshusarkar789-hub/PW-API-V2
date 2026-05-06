/**
 * Advanced API Capture - Popup Script
 * Handles all popup UI interactions, data display, and messaging with background
 */

/* ============================================================
   STATE
   ============================================================ */
let currentState = {
  isCapturing: true,
  captureMode: 'all',
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

let currentPage = 1;
let totalPages = 1;
let searchTimeout = null;
let refreshInterval = null;

/* ============================================================
   INITIALIZATION
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  setupEventListeners();
  startAutoRefresh();
  loadEntries();
});

/**
 * Load state from background script
 */
async function loadState() {
  try {
    const response = await sendMessage({ action: 'getState' });
    if (response) {
      currentState = response;
      updateUI();
    }
  } catch (err) {
    console.error('Failed to load state:', err);
  }
}

/**
 * Send message to background script
 */
function sendMessage(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Message error:', chrome.runtime.lastError.message);
          resolve(null);
          return;
        }
        resolve(response);
      });
    } catch (err) {
      console.error('Send message error:', err);
      resolve(null);
    }
  });
}

/**
 * Start auto-refresh every 2 seconds
 */
function startAutoRefresh() {
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(async () => {
    if (!currentState.isCapturing) return;
    try {
      const state = await sendMessage({ action: 'getState' });
      if (state && state.stats) {
        const prevTotal = currentState.stats.totalEntries;
        currentState = state;
        updateStats();
        // Auto-refresh entries if new data arrived
        if (state.stats.totalEntries !== prevTotal) {
          loadEntries();
        }
      }
    } catch (e) {
      // Ignore refresh errors
    }
  }, 2000);
}

/* ============================================================
   EVENT LISTENERS
   ============================================================ */
function setupEventListeners() {
  // Toggle capture
  document.getElementById('toggleCapture').addEventListener('click', toggleCapture);

  // Settings button -> open options
  document.getElementById('settingsBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('openOptions').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Clear all data
  document.getElementById('clearBtn').addEventListener('click', confirmClearAll);

  // Export button
  document.getElementById('exportBtn').addEventListener('click', toggleExportMenu);
  document.getElementById('closeExportMenu').addEventListener('click', toggleExportMenu);

  // Export menu items
  document.querySelectorAll('.export-menu-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const format = btn.dataset.format;
      handleExport(format);
      toggleExportMenu();
    });
  });

  // Search
  const searchInput = document.getElementById('searchInput');
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      currentPage = 1;
      loadEntries();
    }, 300);
  });

  document.getElementById('clearSearch').addEventListener('click', () => {
    searchInput.value = '';
    document.getElementById('clearSearch').classList.add('hidden');
    currentPage = 1;
    loadEntries();
  });

  // Type filter
  document.getElementById('typeFilter').addEventListener('change', () => {
    currentPage = 1;
    loadEntries();
  });

  // Status filter
  document.getElementById('statusFilter').addEventListener('change', () => {
    currentPage = 1;
    loadEntries();
  });

  // Mode buttons
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      if (mode === 'domains' || mode === 'regex') {
        openModal(mode);
      } else {
        setCaptureMode('all');
      }
    });
  });

  // Mode settings button
  document.getElementById('modeSettings').addEventListener('click', () => {
    openModal(currentState.captureMode);
  });

  // Modal
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalCancel').addEventListener('click', closeModal);
  document.getElementById('modalSave').addEventListener('click', saveModal);

  // Pagination
  document.getElementById('prevPage').addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      loadEntries();
    }
  });

  document.getElementById('nextPage').addEventListener('click', () => {
    if (currentPage < totalPages) {
      currentPage++;
      loadEntries();
    }
  });

  // Close menus on outside click
  document.addEventListener('click', (e) => {
    const exportMenu = document.getElementById('exportMenu');
    const exportBtn = document.getElementById('exportBtn');
    if (!exportMenu.contains(e.target) && !exportBtn.contains(e.target)) {
      exportMenu.classList.add('hidden');
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.getElementById('exportMenu').classList.add('hidden');
    }
  });
}

/* ============================================================
   UI UPDATE FUNCTIONS
   ============================================================ */

/**
 * Update all UI elements based on current state
 */
function updateUI() {
  updateStats();
  updateStatusIndicator();
  updateModeButtons();
}

function updateStats() {
  document.getElementById('statTotal').textContent = formatNumber(currentState.stats.totalEntries);
  document.getElementById('statRequests').textContent = formatNumber(currentState.stats.totalRequests);
  document.getElementById('statResponses').textContent = formatNumber(currentState.stats.totalResponses);
  document.getElementById('statErrors').textContent = formatNumber(currentState.stats.totalErrors);
  document.getElementById('statSize').textContent = formatSize(currentState.stats.storageSizeKB);
}

function updateStatusIndicator() {
  const indicator = document.getElementById('statusIndicator');
  const toggleBtn = document.getElementById('toggleCapture');
  const toggleText = document.getElementById('toggleText');

  if (currentState.isCapturing) {
    indicator.className = 'status-indicator capturing';
    indicator.querySelector('.status-text').textContent = 'Capturing';
    toggleBtn.className = 'capture-toggle capturing';
    toggleText.textContent = 'Pause';
  } else {
    indicator.className = 'status-indicator paused';
    indicator.querySelector('.status-text').textContent = 'Paused';
    toggleBtn.className = 'capture-toggle paused';
    toggleText.textContent = 'Resume';
  }
}

function updateModeButtons() {
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === currentState.captureMode);
  });
}

/**
 * Format large numbers with K suffix
 */
function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return String(num || 0);
}

/**
 * Format storage size
 */
function formatSize(kb) {
  if (kb >= 1024) return (kb / 1024).toFixed(1) + ' MB';
  return (kb || 0) + ' KB';
}

/* ============================================================
   CAPTURE TOGGLE
   ============================================================ */
async function toggleCapture() {
  try {
    const response = await sendMessage({ action: 'toggleCapture' });
    if (response) {
      currentState.isCapturing = response.isCapturing;
      updateStatusIndicator();
      showToast(response.isCapturing ? 'Capture resumed' : 'Capture paused',
                response.isCapturing ? 'success' : '');
    }
  } catch (err) {
    showToast('Failed to toggle capture', 'error');
  }
}

/* ============================================================
   CAPTURE MODE
   ============================================================ */
async function setCaptureMode(mode) {
  try {
    const response = await sendMessage({ action: 'setCaptureMode', mode });
    if (response) {
      currentState.captureMode = response.captureMode;
      updateModeButtons();
      showToast(`Mode: ${mode === 'all' ? 'All URLs' : mode === 'domains' ? 'Target Domains' : 'Custom Regex'}`, 'success');
    }
  } catch (err) {
    showToast('Failed to set capture mode', 'error');
  }
}

/* ============================================================
   MODAL (Domains/Regex Configuration)
   ============================================================ */
let currentModalMode = 'domains';

function openModal(mode) {
  currentModalMode = mode;
  const overlay = document.getElementById('modalOverlay');
  const title = document.getElementById('modalTitle');
  const desc = document.getElementById('modalDescription');
  const textarea = document.getElementById('modalTextarea');

  if (mode === 'domains') {
    title.textContent = 'Target Domains';
    desc.textContent = 'Enter one domain per line. Requests will only be captured from these domains.';
    textarea.value = currentState.targetDomains.join('\n');
    textarea.placeholder = 'api.example.com\napi.penpencil.co\nsec-prod-mediacdn.pw.live';
  } else if (mode === 'regex') {
    title.textContent = 'Custom Regex Patterns';
    desc.textContent = 'Enter one regex pattern per line. URLs matching any pattern will be captured.';
    textarea.value = currentState.customRegex.join('\n');
    textarea.placeholder = 'api\\..+\\.com\n/api/v\\d+/.+\n.*\\.json';
  }

  overlay.classList.remove('hidden');
  textarea.focus();
}

function closeModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
}

async function saveModal() {
  const textarea = document.getElementById('modalTextarea');
  const value = textarea.value;

  try {
    let response;
    if (currentModalMode === 'domains') {
      response = await sendMessage({
        action: 'setTargetDomains',
        domains: value
      });
    } else {
      response = await sendMessage({
        action: 'setCustomRegex',
        patterns: value
      });
    }

    if (response) {
      currentState.captureMode = response.captureMode;
      if (response.targetDomains) currentState.targetDomains = response.targetDomains;
      if (response.customRegex) currentState.customRegex = response.customRegex;
      updateModeButtons();
      showToast('Capture mode updated', 'success');
    }

    closeModal();
  } catch (err) {
    showToast('Failed to save capture mode', 'error');
  }
}

/* ============================================================
   ENTRIES LOADING & RENDERING
   ============================================================ */
async function loadEntries() {
  const entriesList = document.getElementById('entriesList');
  const emptyState = document.getElementById('emptyState');
  const loadingState = document.getElementById('loadingState');
  const search = document.getElementById('searchInput').value;
  const type = document.getElementById('typeFilter').value;
  const status = document.getElementById('statusFilter').value;

  // Show clear search button
  document.getElementById('clearSearch').classList.toggle('hidden', !search);

  try {
    // Clear old entries (keep empty/loading state)
    const oldCards = entriesList.querySelectorAll('.entry-card');
    oldCards.forEach(c => c.remove());

    emptyState.classList.add('hidden');
    loadingState.classList.remove('hidden');

    const response = await sendMessage({
      action: 'getEntries',
      filters: { search, type, status, page: currentPage, limit: 50 }
    });

    loadingState.classList.add('hidden');

    if (!response || response.error) {
      emptyState.querySelector('p').textContent = 'Error loading entries';
      emptyState.querySelector('.empty-hint').textContent = response?.error || 'Unknown error';
      emptyState.classList.remove('hidden');
      return;
    }

    const entries = response.entries || [];

    if (entries.length === 0) {
      if (search || type !== 'all' || status !== 'all') {
        emptyState.querySelector('p').textContent = 'No matching entries';
        emptyState.querySelector('.empty-hint').textContent = 'Try adjusting your filters';
      } else {
        emptyState.querySelector('p').textContent = 'No captured requests yet';
        emptyState.querySelector('.empty-hint').textContent = 'Browse websites to start capturing API traffic';
      }
      emptyState.classList.remove('hidden');
      document.getElementById('pagination').classList.add('hidden');
      return;
    }

    emptyState.classList.add('hidden');

    // Render entries
    const fragment = document.createDocumentFragment();
    entries.forEach(entry => {
      fragment.appendChild(createEntryCard(entry));
    });
    entriesList.appendChild(fragment);

    // Update pagination
    currentPage = response.page || 1;
    totalPages = response.totalPages || 1;
    updatePagination();
  } catch (err) {
    loadingState.classList.add('hidden');
    emptyState.querySelector('p').textContent = 'Failed to load entries';
    emptyState.querySelector('.empty-hint').textContent = err.message;
    emptyState.classList.remove('hidden');
  }
}

/**
 * Create an entry card DOM element
 */
function createEntryCard(entry) {
  const card = document.createElement('div');
  card.className = 'entry-card';

  if (entry.error) card.classList.add('has-error');
  if (entry.method === 'RESOURCE' || entry.method === 'PAGE_RESOURCES') card.classList.add('is-resource');

  const method = (entry.method || 'GET').toUpperCase();
  const statusCode = entry.statusCode;
  const time = formatTime(entry.timestamp);
  const size = formatBytes(entry.responseSize);

  card.innerHTML = `
    <div class="entry-header">
      <span class="method-badge ${getMethodClass(method, entry)}">${truncateMethod(method)}</span>
      <span class="status-badge ${getStatusClass(statusCode, entry.error)}">${statusCode || (entry.error ? 'ERR' : '—')}</span>
      <span class="entry-url" title="${escapeHtml(entry.url || '')}">${escapeHtml(truncateUrl(entry.url || '', 60))}</span>
      <div class="entry-meta">
        <span class="entry-size">${size}</span>
        <span class="entry-time">${time}</span>
        <span class="entry-expand-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </span>
      </div>
    </div>
    <div class="entry-detail">
      ${renderEntryDetail(entry)}
    </div>
  `;

  // Toggle expand
  const header = card.querySelector('.entry-header');
  header.addEventListener('click', () => {
    card.classList.toggle('expanded');
  });

  return card;
}

/**
 * Render the detailed view of an entry
 */
function renderEntryDetail(entry) {
  let html = '';

  // URL & Method
  html += `
    <div class="detail-section">
      <div class="detail-section-title">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        General
      </div>
      <div class="detail-info-grid">
        <span class="detail-info-label">Method:</span>
        <span class="detail-info-value">${escapeHtml(entry.method || 'GET')}</span>
        <span class="detail-info-label">URL:</span>
        <span class="detail-url">${escapeHtml(entry.url || '')}</span>
        <span class="detail-info-label">Status:</span>
        <span class="detail-info-value">${entry.statusCode || '—'} ${escapeHtml(entry.statusText || '')}</span>
        <span class="detail-info-label">Type:</span>
        <span class="detail-info-value">${escapeHtml(entry.type || 'other')}</span>
        <span class="detail-info-label">Domain:</span>
        <span class="detail-info-value">${escapeHtml(entry.domain || '')}</span>
        <span class="detail-info-label">Duration:</span>
        <span class="detail-info-value">${entry.duration || 0}ms</span>
        <span class="detail-info-label">Time:</span>
        <span class="detail-info-value">${escapeHtml(entry.timestamp || '')}</span>
        <span class="detail-info-label">Cache:</span>
        <span class="detail-info-value">${entry.fromCache ? 'Yes' : 'No'}</span>
        <span class="detail-info-label">Content-Type:</span>
        <span class="detail-info-value">${escapeHtml(entry.contentType || '—')}</span>
      </div>
    </div>
  `;

  // Request Headers
  const reqHeaders = entry.requestHeaders || {};
  const reqHeaderKeys = Object.keys(reqHeaders);
  if (reqHeaderKeys.length > 0) {
    html += `
      <div class="detail-section">
        <div class="detail-section-title">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>
          Request Headers
        </div>
        <div class="detail-headers">${reqHeaderKeys.map(k =>
          `<span class="header-name">${escapeHtml(k)}</span>: <span class="header-value">${escapeHtml(reqHeaders[k])}</span>`
        ).join('<br>')}</div>
      </div>
    `;
  }

  // Request Body
  if (entry.requestBody) {
    html += `
      <div class="detail-section">
        <div class="detail-section-title">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Request Body
        </div>
        <div class="code-block" style="position:relative">
          <button class="copy-btn" onclick="copyToClipboard(this, '${escapeAttr(entry.requestBody)}')">Copy</button>
          ${syntaxHighlight(entry.requestBody)}
        </div>
      </div>
    `;
  }

  // Response Headers
  const resHeaders = entry.responseHeaders || {};
  const resHeaderKeys = Object.keys(resHeaders);
  if (resHeaderKeys.length > 0) {
    html += `
      <div class="detail-section">
        <div class="detail-section-title">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Response Headers
        </div>
        <div class="detail-headers">${resHeaderKeys.map(k =>
          `<span class="header-name">${escapeHtml(k)}</span>: <span class="header-value">${escapeHtml(resHeaders[k])}</span>`
        ).join('<br>')}</div>
      </div>
    `;
  }

  // Response Body
  if (entry.responseBody) {
    html += `
      <div class="detail-section">
        <div class="detail-section-title">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
          Response Body${entry.responseSize ? ` (${formatBytes(entry.responseSize)})` : ''}
        </div>
        <div class="code-block" style="position:relative">
          <button class="copy-btn" onclick="copyToClipboard(this, '${escapeAttr(entry.responseBody)}')">Copy</button>
          ${syntaxHighlight(entry.responseBody)}
        </div>
      </div>
    `;
  }

  // Error
  if (entry.error) {
    html += `
      <div class="detail-section">
        <div class="detail-section-title" style="color:var(--red)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          Error
        </div>
        <div class="code-block" style="color:var(--red)">${escapeHtml(entry.error)}</div>
      </div>
    `;
  }

  return html;
}

/* ============================================================
   HELPER FUNCTIONS
   ============================================================ */

function getMethodClass(method, entry) {
  if (method === 'RESOURCE' || method === 'PAGE_RESOURCES') return 'resource';
  const classes = { GET: 'get', POST: 'post', PUT: 'put', DELETE: 'delete', PATCH: 'patch', HEAD: 'head', OPTIONS: 'options' };
  return classes[method] || 'default';
}

function truncateMethod(method) {
  if (method === 'RESOURCE' || method === 'PAGE_RESOURCES') return 'RES';
  return method.substring(0, 7);
}

function getStatusClass(statusCode, error) {
  if (error && !statusCode) return 'error';
  if (!statusCode && statusCode !== 0) return 's0';
  if (statusCode >= 200 && statusCode < 300) return 's2xx';
  if (statusCode >= 300 && statusCode < 400) return 's3xx';
  if (statusCode >= 400 && statusCode < 500) return 's4xx';
  if (statusCode >= 500) return 's5xx';
  return 's0';
}

function truncateUrl(url, maxLen) {
  if (url.length <= maxLen) return url;
  // Show the beginning and end
  const start = url.substring(0, maxLen - 30);
  const end = url.substring(url.length - 27);
  return start + '...' + end;
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  try {
    const d = new Date(timestamp);
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '';
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return bytes + ' B';
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(str) {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .substring(0, 10000); // Limit for inline attribute
}

/**
 * Syntax highlight JSON/Text
 */
function syntaxHighlight(text) {
  if (!text) return '';

  // Try JSON
  try {
    const parsed = JSON.parse(text);
    const highlighted = JSON.stringify(parsed, null, 2);
    return highlightJSON(highlighted);
  } catch (e) {
    // Not valid JSON, check if it looks like JSON
    if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
      // Try to highlight anyway
      return highlightJSON(text);
    }
    // Plain text
    return escapeHtml(text);
  }
}

function highlightJSON(jsonStr) {
  // Simple JSON syntax highlighting
  return escapeHtml(jsonStr)
    .replace(/("(?:\\.|[^"\\])*")\s*:/g, '<span class="json-key">$1</span>:')
    .replace(/:\s*("(?:\\.|[^"\\])*")/g, ': <span class="json-string">$1</span>')
    .replace(/:\s*(\d+\.?\d*)/g, ': <span class="json-number">$1</span>')
    .replace(/:\s*(true|false)/g, ': <span class="json-boolean">$1</span>')
    .replace(/:\s*(null)/g, ': <span class="json-null">$1</span>');
}

/**
 * Copy text to clipboard
 */
function copyToClipboard(btn, text) {
  // Decode escaped text
  try {
    const decoded = text
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');

    navigator.clipboard.writeText(decoded).then(() => {
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = 'Copy';
        btn.classList.remove('copied');
      }, 2000);
    });
  } catch (e) {
    showToast('Failed to copy', 'error');
  }
}

// Make copyToClipboard available globally
window.copyToClipboard = copyToClipboard;

/* ============================================================
   PAGINATION
   ============================================================ */
function updatePagination() {
  const pagination = document.getElementById('pagination');
  const prevBtn = document.getElementById('prevPage');
  const nextBtn = document.getElementById('nextPage');
  const pageInfo = document.getElementById('pageInfo');

  if (totalPages <= 1) {
    pagination.classList.add('hidden');
    return;
  }

  pagination.classList.remove('hidden');
  prevBtn.disabled = currentPage <= 1;
  nextBtn.disabled = currentPage >= totalPages;
  pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
}

/* ============================================================
   EXPORT
   ============================================================ */
function toggleExportMenu() {
  document.getElementById('exportMenu').classList.toggle('hidden');
}

async function handleExport(format) {
  showToast(`Exporting as ${format.toUpperCase()}...`, '');

  try {
    const response = await sendMessage({
      action: 'exportData',
      format,
      filters: getCurrentFilters()
    });

    if (response && response.success) {
      showToast(`Exported ${response.entryCount} entries as ${format.toUpperCase()}`, 'success');
    } else {
      showToast(`Export failed: ${response?.error || 'Unknown error'}`, 'error');
    }
  } catch (err) {
    showToast(`Export failed: ${err.message}`, 'error');
  }
}

function getCurrentFilters() {
  return {
    search: document.getElementById('searchInput').value || undefined,
    type: document.getElementById('typeFilter').value,
    status: document.getElementById('statusFilter').value
  };
}

/* ============================================================
   CLEAR ALL DATA
   ============================================================ */
function confirmClearAll() {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-dialog">
      <h3>⚠️ Clear All Data?</h3>
      <p>This will permanently delete all ${formatNumber(currentState.stats.totalEntries)} captured entries. This cannot be undone.</p>
      <div class="confirm-actions">
        <button class="confirm-cancel">Cancel</button>
        <button class="confirm-ok">Clear All</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('.confirm-cancel').addEventListener('click', () => {
    overlay.remove();
  });

  overlay.querySelector('.confirm-ok').addEventListener('click', async () => {
    overlay.remove();
    try {
      const response = await sendMessage({ action: 'clearAll' });
      if (response && response.success) {
        currentState.stats = { totalEntries: 0, totalRequests: 0, totalResponses: 0, totalErrors: 0, storageSizeKB: 0 };
        updateStats();
        currentPage = 1;
        loadEntries();
        showToast('All data cleared', 'success');
      }
    } catch (err) {
      showToast('Failed to clear data', 'error');
    }
  });

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

/* ============================================================
   TOAST NOTIFICATION
   ============================================================ */
function showToast(message, type = '') {
  // Remove existing toasts
  document.querySelectorAll('.toast').forEach(t => t.remove());

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}
