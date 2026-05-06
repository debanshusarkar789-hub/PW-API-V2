/**
 * Advanced API Capture - Content Script
 * Injects fetch() and XMLHttpRequest interceptors
 * Captures request/response bodies from any page
 * Runs at document_start to intercept all requests
 */

(function () {
  'use strict';

  // Avoid double-injection
  if (window.__apiCaptureInjected) return;
  window.__apiCaptureInjected = true;

  const MAX_BODY_SIZE = 2 * 1024 * 1024; // 2MB max body size
  const EXCLUDED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'woff', 'woff2', 'ttf', 'eot', 'mp3', 'mp4', 'webm', 'ogg', 'webp'];

  /**
   * Check if URL should have its body captured
   */
  function shouldCaptureBody(url) {
    if (!url) return false;
    try {
      const pathname = new URL(url).pathname.toLowerCase();
      return !EXCLUDED_EXTENSIONS.some(ext => pathname.endsWith('.' + ext));
    } catch {
      return true;
    }
  }

  /**
   * Safely read a response body
   */
  async function readBody(response) {
    try {
      if (!response || !response.body) return '';
      const clone = response.clone();
      const contentType = clone.headers.get('content-type') || '';

      if (contentType.includes('application/json') ||
          contentType.includes('text/') ||
          contentType.includes('application/xml') ||
          contentType.includes('application/xhtml')) {
        const text = await clone.text();
        return text.length > MAX_BODY_SIZE ? text.substring(0, MAX_BODY_SIZE) + '[TRUNCATED]' : text;
      }
      return '';
    } catch {
      return '';
    }
  }

  /**
   * Generate a correlation ID for the request
   */
  function getCorrelationId(url, method, initiator) {
    // Use URL + method + timestamp for correlation
    return `${method}:${url}:${Date.now()}`;
  }

  /* ============================================================
     FETCH INTERCEPTOR
     ============================================================ */
  const OriginalFetch = window.fetch;
  window.fetch = async function (...args) {
    const [input, init] = args;
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    const method = (init?.method || input?.method || 'GET').toUpperCase();

    let requestBody = '';
    if (init?.body && shouldCaptureBody(url)) {
      try {
        if (typeof init.body === 'string') {
          requestBody = init.body;
        } else if (init.body instanceof FormData) {
          // Can't easily read FormData after it's used, capture keys
          const formData = new FormData();
          // Read the entries
          const entries = [...init.body.entries()];
          requestBody = JSON.stringify(
            entries.map(([key, value]) => [key, value instanceof File ? `[File: ${value.name}]` : value])
          );
        } else if (init.body instanceof URLSearchParams) {
          requestBody = init.body.toString();
        } else if (init.body instanceof ArrayBuffer) {
          requestBody = '[ArrayBuffer]';
        } else if (init.body instanceof Blob) {
          requestBody = `[Blob: ${init.body.type || 'unknown'}]`;
        } else {
          requestBody = String(init.body);
        }
      } catch (e) {
        requestBody = '[Error reading body]';
      }
    }

    const correlationId = getCorrelationId(url, method);

    try {
      const response = await OriginalFetch.apply(this, args);

      // Read response body asynchronously
      if (shouldCaptureBody(url)) {
        readBody(response).then(responseBody => {
          sendBodyToBackground(correlationId, url, method, requestBody, responseBody);
        });
      } else if (requestBody) {
        sendBodyToBackground(correlationId, url, method, requestBody, '');
      }

      return response;
    } catch (error) {
      // Send error info
      sendBodyToBackground(correlationId, url, method, requestBody, '', error.message);
      throw error;
    }
  };

  /* ============================================================
     XMLHttpRequest INTERCEPTOR
     ============================================================ */
  const OriginalXHROpen = XMLHttpRequest.prototype.open;
  const OriginalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__apiCaptureUrl = url;
    this.__apiCaptureMethod = method;
    this.__apiCaptureCorrelationId = getCorrelationId(url, method);
    return OriginalXHROpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function (body) {
    const url = this.__apiCaptureUrl || '';
    const method = this.__apiCaptureMethod || 'GET';
    const correlationId = this.__apiCaptureCorrelationId;

    let requestBody = '';
    if (body && shouldCaptureBody(url)) {
      try {
        if (typeof body === 'string') {
          requestBody = body;
        } else if (body instanceof FormData) {
          const entries = [...body.entries()];
          requestBody = JSON.stringify(
            entries.map(([key, value]) => [key, value instanceof File ? `[File: ${value.name}]` : value])
          );
        } else if (body instanceof URLSearchParams) {
          requestBody = body.toString();
        } else if (body instanceof ArrayBuffer) {
          requestBody = '[ArrayBuffer]';
        } else if (body instanceof Blob) {
          requestBody = `[Blob: ${body.type || 'unknown'}]`;
        } else {
          requestBody = String(body);
        }
      } catch (e) {
        requestBody = '[Error reading body]';
      }
    }

    // Set up response capture
    if (shouldCaptureBody(url)) {
      this.addEventListener('load', function () {
        try {
          let responseBody = '';
          const contentType = this.getResponseHeader('content-type') || '';

          if (contentType.includes('application/json') ||
              contentType.includes('text/') ||
              contentType.includes('application/xml')) {
            responseBody = this.responseText || '';
            if (responseBody.length > MAX_BODY_SIZE) {
              responseBody = responseBody.substring(0, MAX_BODY_SIZE) + '[TRUNCATED]';
            }
          }

          sendBodyToBackground(correlationId, url, method, requestBody, responseBody);
        } catch (e) {
          sendBodyToBackground(correlationId, url, method, requestBody, '', e.message);
        }
      });

      this.addEventListener('error', function () {
        sendBodyToBackground(correlationId, url, method, requestBody, '', 'Network Error');
      });

      this.addEventListener('timeout', function () {
        sendBodyToBackground(correlationId, url, method, requestBody, '', 'Request Timeout');
      });
    } else if (requestBody) {
      this.addEventListener('load', function () {
        sendBodyToBackground(correlationId, url, method, requestBody, '');
      });
    }

    return OriginalXHRSend.apply(this, [body]);
  };

  /* ============================================================
     COMMUNICATION WITH BACKGROUND SCRIPT
     ============================================================ */

  /**
   * Send captured body data to background script
   */
  function sendBodyToBackground(correlationId, url, method, requestBody, responseBody, error) {
    try {
      chrome.runtime.sendMessage({
        action: 'captureBody',
        correlationId,
        url,
        method,
        requestBody: requestBody || '',
        responseBody: responseBody || '',
        error: error || null
      }).catch(() => {
        // Extension context might be invalidated
      });
    } catch (e) {
      // Silent fail - extension might be reloaded
    }
  }

  /* ============================================================
     MUTATION OBSERVER - Detect dynamically added resources
     ============================================================ */
  if (document && document.addEventListener) {
    document.addEventListener('DOMContentLoaded', () => {
      // Observe DOM changes for dynamically added scripts/elements
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              detectResourceElements(node);
            }
          }
        }
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });

      // Initial scan
      detectAllResources();
    });
  }

  /**
   * Detect resource elements in a node
   */
  function detectResourceElements(node) {
    const resources = [];

    // Scripts
    if (node.tagName === 'SCRIPT' && node.src) {
      resources.push({ type: 'script', url: node.src });
    }

    // Stylesheets
    if (node.tagName === 'LINK' && node.rel === 'stylesheet' && node.href) {
      resources.push({ type: 'stylesheet', url: node.href });
    }

    // Images
    if (node.tagName === 'IMG' && (node.src || node.dataset.src)) {
      const src = node.src || node.dataset.src;
      if (src) resources.push({ type: 'image', url: src });
    }

    // Video
    if (node.tagName === 'VIDEO') {
      if (node.src) resources.push({ type: 'video', url: node.src });
      if (node.poster) resources.push({ type: 'video-poster', url: node.poster });
      const sources = node.querySelectorAll('source');
      sources.forEach(s => {
        if (s.src) resources.push({ type: 'video-source', url: s.src });
      });
    }

    // Audio
    if (node.tagName === 'AUDIO') {
      if (node.src) resources.push({ type: 'audio', url: node.src });
    }

    // Iframe
    if (node.tagName === 'IFRAME' && node.src) {
      resources.push({ type: 'iframe', url: node.src });
    }

    // Report resources
    if (resources.length > 0) {
      try {
        chrome.runtime.sendMessage({
          action: 'captureBody',
          correlationId: `resource_${Date.now()}`,
          url: resources.map(r => r.url).join(', '),
          method: 'RESOURCE',
          requestBody: JSON.stringify(resources),
          responseBody: '',
          error: null
        }).catch(() => {});
      } catch (e) {
        // Silent fail
      }
    }
  }

  /**
   * Scan entire document for existing resources
   */
  function detectAllResources() {
    const allScripts = document.querySelectorAll('script[src]');
    const allLinks = document.querySelectorAll('link[rel="stylesheet"][href]');
    const allImages = document.querySelectorAll('img[src]');
    const allVideos = document.querySelectorAll('video');
    const allIframes = document.querySelectorAll('iframe[src]');

    const resources = [];

    allScripts.forEach(s => resources.push({ type: 'script', url: s.src }));
    allLinks.forEach(l => resources.push({ type: 'stylesheet', url: l.href }));
    allImages.forEach(i => resources.push({ type: 'image', url: i.src }));
    allIframes.forEach(f => resources.push({ type: 'iframe', url: f.src }));
    allVideos.forEach(v => {
      if (v.src) resources.push({ type: 'video', url: v.src });
      v.querySelectorAll('source').forEach(s => {
        if (s.src) resources.push({ type: 'video-source', url: s.src });
      });
    });

    if (resources.length > 0) {
      try {
        chrome.runtime.sendMessage({
          action: 'captureBody',
          correlationId: `page_resources_${Date.now()}`,
          url: window.location.href,
          method: 'PAGE_RESOURCES',
          requestBody: JSON.stringify(resources),
          responseBody: '',
          error: null
        }).catch(() => {});
      } catch (e) {
        // Silent fail
      }
    }
  }

  console.log('[API Capture] Content script injected v3.0.0');
})();
