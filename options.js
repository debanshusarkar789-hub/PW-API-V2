/**
 * Advanced API Capture - Options Page Script
 * Handles settings management, statistics display, and data export
 */

/* ============================================================
   STATE
   ============================================================ */
let currentSettings = {};
let currentState = {};

/* ============================================================
   INITIALIZATION
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadStats();
  setupEventListeners();
});

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
 * Load current settings from background
 */
async function loadSettings() {
  const response = await sendMessage({ action: 'getSettings' });
  if (response) {
    currentSettings = response;
    applySettingsToUI(response);
  }
}

/**
 * Load statistics
 */
async function loadStats() {
  const stateResponse = await sendMessage({ action: 'getState' });
  if (stateResponse) {
    currentState = stateResponse;
  }

  // Also get entries for unique domain count
  const entriesResponse = await sendMessage({
    action: 'getEntries',
    filters: { page: 1, limit: 1 }
  });

  const stats = stateResponse?.stats || currentState.stats || {};

  // Calculate unique domains from entries
  let uniqueDomains = 0;
  if (entriesResponse && entriesResponse.total > 0) {
    const allEntries = await sendMessage({
      action: 'getEntries',
      filters: { page: 1, limit: 50000 }
    });
    if (allEntries && allEntries.entries) {
      const domains = new Set(allEntries.entries.map(e => e.domain).filter(Boolean));
      uniqueDomains = domains.size;
    }
  }

  document.getElementById('optStatTotal').textContent = formatNumber(stats.totalEntries || 0);
  document.getElementById('optStatRequests').textContent = formatNumber(stats.totalRequests || 0);
  document.getElementById('optStatResponses').textContent = formatNumber(stats.totalResponses || 0);
  document.getElementById('optStatErrors').textContent = formatNumber(stats.totalErrors || 0);
  document.getElementById('optStatDomains').textContent = formatNumber(uniqueDomains);
  document.getElementById('optStatSize').textContent = formatSize(stats.storageSizeKB || 0);
}

/**
 * Apply settings to form inputs
 */
function applySettingsToUI(settings) {
  document.getElementById('maxEntries').value = settings.maxEntries || 10000;
  document.getElementById('captureHeaders').checked = settings.captureHeaders !== false;
  document.getElementById('captureBodies').checked = settings.captureBodies !== false;
  document.getElementById('highlightErrors').checked = settings.highlightErrors !== false;
  document.getElementById('showNotifications').checked = settings.showNotifications === true;
  document.getElementById('playSoundOnError').checked = settings.playSoundOnError === true;

  // Theme
  const theme = settings.theme || 'dark';
  document.querySelectorAll('input[name="theme"]').forEach(radio => {
    radio.checked = radio.value === theme;
  });
}

/* ============================================================
   EVENT LISTENERS
   ============================================================ */
function setupEventListeners() {
  // Save settings
  document.getElementById('saveBtn').addEventListener('click', saveSettings);

  // Reset to defaults
  document.getElementById('resetBtn').addEventListener('click', resetSettings);

  // Export buttons
  document.getElementById('exportJSON').addEventListener('click', () => handleExport('json'));
  document.getElementById('exportHAR').addEventListener('click', () => handleExport('har'));
  document.getElementById('exportCSV').addEventListener('click', () => handleExport('csv'));
  document.getElementById('exportNDJSON').addEventListener('click', () => handleExport('ndjson'));
  document.getElementById('exportSQL').addEventListener('click', () => handleExport('sql'));
  document.getElementById('exportMD').addEventListener('click', () => handleExport('markdown'));

  // Clear all
  document.getElementById('clearAll').addEventListener('click', confirmClearAll);

  // Confirm dialog buttons
  document.getElementById('confirmCancel').addEventListener('click', closeConfirm);
}

/* ============================================================
   SETTINGS MANAGEMENT
   ============================================================ */

/**
 * Save settings from UI to background
 */
async function saveSettings() {
  const settings = {
    maxEntries: parseInt(document.getElementById('maxEntries').value) || 10000,
    captureHeaders: document.getElementById('captureHeaders').checked,
    captureBodies: document.getElementById('captureBodies').checked,
    highlightErrors: document.getElementById('highlightErrors').checked,
    showNotifications: document.getElementById('showNotifications').checked,
    playSoundOnError: document.getElementById('playSoundOnError').checked,
    theme: document.querySelector('input[name="theme"]:checked')?.value || 'dark'
  };

  // Validate max entries
  if (settings.maxEntries < 100) settings.maxEntries = 100;
  if (settings.maxEntries > 50000) settings.maxEntries = 50000;

  const response = await sendMessage({
    action: 'saveSettings',
    settings
  });

  if (response && response.success) {
    currentSettings = response.settings;
    showToast('Settings saved successfully', 'success');
  } else {
    showToast('Failed to save settings', 'error');
  }
}

/**
 * Reset settings to defaults
 */
async function resetSettings() {
  showConfirm(
    'Reset to Defaults?',
    'All settings will be restored to their default values.',
    async () => {
      const response = await sendMessage({ action: 'resetSettings' });
      if (response && response.success) {
        currentSettings = response.settings;
        applySettingsToUI(response.settings);
        showToast('Settings reset to defaults', 'success');
      } else {
        showToast('Failed to reset settings', 'error');
      }
    }
  );
}

/* ============================================================
   EXPORT
   ============================================================ */
async function handleExport(format) {
  showToast(`Exporting as ${format.toUpperCase()}...`, '');

  try {
    const response = await sendMessage({
      action: 'exportData',
      format
    });

    if (response && response.success) {
      showToast(`Exported ${response.entryCount} entries as ${format.toUpperCase()}`, 'success');
      // Refresh stats after export
      loadStats();
    } else {
      showToast(`Export failed: ${response?.error || 'Unknown error'}`, 'error');
    }
  } catch (err) {
    showToast(`Export failed: ${err.message}`, 'error');
  }
}

/* ============================================================
   CLEAR ALL DATA
   ============================================================ */
function confirmClearAll() {
  showConfirm(
    '⚠️ Clear All Data?',
    'This will permanently delete all captured entries. This cannot be undone.',
    async () => {
      const response = await sendMessage({ action: 'clearAll' });
      if (response && response.success) {
        showToast('All data cleared successfully', 'success');
        loadStats();
      } else {
        showToast('Failed to clear data', 'error');
      }
    }
  );
}

/* ============================================================
   CONFIRM DIALOG
   ============================================================ */
let confirmCallback = null;

function showConfirm(title, message, callback) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  document.getElementById('confirmOverlay').classList.remove('hidden');
  confirmCallback = callback;

  const okBtn = document.getElementById('confirmOk');
  const newOkBtn = okBtn.cloneNode(true);
  okBtn.parentNode.replaceChild(newOkBtn, okBtn);
  newOkBtn.addEventListener('click', async () => {
    closeConfirm();
    if (confirmCallback) await confirmCallback();
  });
}

function closeConfirm() {
  document.getElementById('confirmOverlay').classList.add('hidden');
  confirmCallback = null;
}

/* ============================================================
   TOAST NOTIFICATIONS
   ============================================================ */
function showToast(message, type = '') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* ============================================================
   HELPER FUNCTIONS
   ============================================================ */

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return String(num || 0);
}

function formatSize(kb) {
  if (kb >= 1024) return (kb / 1024).toFixed(1) + ' MB';
  return (kb || 0) + ' KB';
}
