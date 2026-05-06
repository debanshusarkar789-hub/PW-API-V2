/**
 * Advanced API Capture - Export Library
 * Provides various export format functions for captured data
 * Can be used from popup, options page, or background script
 */

const APIExport = {

  /**
   * Export captured entries as formatted JSON
   */
  toJSON(entries) {
    return JSON.stringify({
      metadata: {
        name: 'Advanced API Capture',
        version: '3.0.0',
        exportedAt: new Date().toISOString(),
        exportFormat: 'json',
        totalEntries: entries.length,
        generator: 'Advanced API Capture v3.0.0'
      },
      entries: entries.map(this._cleanEntry)
    }, null, 2);
  },

  /**
   * Export as CSV
   */
  toCSV(entries) {
    const headers = [
      'id', 'method', 'url', 'statusCode', 'statusText', 'domain',
      'contentType', 'fromCache', 'error', 'duration_ms',
      'timestamp', 'requestBody', 'responseBody', 'responseSize_bytes'
    ];

    const escapeCSV = (str) => {
      if (!str && str !== '') return '""';
      const s = String(str).replace(/"/g, '""');
      return `"${s}"`;
    };

    const truncate = (str, max = 5000) => {
      if (!str) return '';
      return str.length > max ? str.substring(0, max) + '...' : str;
    };

    const rows = entries.map(e => [
      escapeCSV(e.id || ''),
      escapeCSV(e.method || ''),
      escapeCSV(e.url || ''),
      e.statusCode ?? '',
      escapeCSV(e.statusText || ''),
      escapeCSV(e.domain || ''),
      escapeCSV(e.contentType || ''),
      e.fromCache ? 'true' : 'false',
      escapeCSV(e.error || ''),
      e.duration ?? '',
      escapeCSV(e.timestamp || ''),
      escapeCSV(truncate(e.requestBody)),
      escapeCSV(truncate(e.responseBody)),
      e.responseSize || 0
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  },

  /**
   * Export as HAR (HTTP Archive) format
   */
  toHAR(entries) {
    const harEntries = entries.map(e => {
      let queryString = [];
      try {
        const urlObj = new URL(e.url || '');
        queryString = Array.from(urlObj.searchParams.entries()).map(([name, value]) => ({
          name, value
        }));
      } catch { /* ignore */ }

      return {
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
          queryString,
          postData: e.requestBody ? {
            mimeType: e.requestHeaders?.['content-type'] || 'application/octet-stream',
            text: e.requestBody
          } : undefined,
          headersSize: -1,
          bodySize: e.requestBody ? new Blob([e.requestBody]).size : 0
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
        cache: e.fromCache ? {
          beforeRequest: null,
          afterRequest: null
        } : undefined,
        timings: {
          send: 0,
          wait: e.duration || 0,
          receive: 0,
          blocked: 0,
          dns: 0,
          connect: 0,
          ssl: 0
        }
      };
    });

    return JSON.stringify({
      log: {
        version: '1.2',
        creator: {
          name: 'Advanced API Capture',
          version: '3.0.0'
        },
        browser: {
          name: 'Chrome',
          version: navigator?.userAgent?.match(/Chrome\/(\d+)/)?.[1] || 'Unknown'
        },
        pages: [{
          id: 'page_1',
          title: 'API Capture Export',
          startedDateTime: new Date().toISOString()
        }],
        entries: harEntries
      }
    }, null, 2);
  },

  /**
   * Export as NDJSON (Newline Delimited JSON)
   */
  toNDJSON(entries) {
    return entries.map(e => JSON.stringify(this._cleanEntry(e))).join('\n');
  },

  /**
   * Export as SQL INSERT statements
   */
  toSQL(entries) {
    const escape = (str) => {
      if (!str && str !== '') return 'NULL';
      return "'" + String(str).replace(/'/g, "''").replace(/\\/g, '\\\\') + "'";
    };

    const truncate = (str, max = 10000) => {
      if (!str) return '';
      return str.length > max ? str.substring(0, max) + '...' : str;
    };

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
      '  from_cache INTEGER DEFAULT 0,',
      '  error TEXT,',
      '  duration INTEGER,',
      '  timestamp TEXT,',
      '  request_headers TEXT,',
      '  request_body TEXT,',
      '  response_headers TEXT,',
      '  response_body TEXT,',
      '  response_size INTEGER DEFAULT 0',
      ');',
      ''
    ];

    for (const e of entries) {
      const values = [
        escape(e.id),
        escape(e.method),
        escape(e.url),
        e.statusCode ?? 'NULL',
        escape(e.statusText),
        escape(e.domain),
        escape(e.contentType),
        e.fromCache ? '1' : '0',
        escape(e.error),
        e.duration ?? 'NULL',
        escape(e.timestamp),
        escape(JSON.stringify(e.requestHeaders || {})),
        escape(truncate(e.requestBody)),
        escape(JSON.stringify(e.responseHeaders || {})),
        escape(truncate(e.responseBody)),
        e.responseSize || 0
      ];
      lines.push(`INSERT INTO api_capture VALUES (${values.join(', ')});`);
    }

    return lines.join('\n');
  },

  /**
   * Export as Markdown table
   */
  toMarkdown(entries) {
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
      const shortUrl = (e.url || '').substring(0, 80);
      lines.push(
        `| ${i + 1} | **${e.method || '-'}** | ${e.statusCode || '-'} | ${shortUrl} | ${e.domain || '-'} | ${e.contentType || '-'} | ${e.duration || '-'}ms | ${(e.timestamp || '').substring(0, 19)} |`
      );
    });

    if (entries.length > 100) {
      lines.push('', `> ... and ${entries.length - 100} more entries. Export as JSON for complete data.`);
    }

    lines.push('', '---', '*Generated by Advanced API Capture v3.0.0*');

    return lines.join('\n');
  },

  /**
   * Download data as a file
   */
  download(content, filename, mimeType = 'text/plain') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  },

  /**
   * Export helper - clean entry for export
   */
  _cleanEntry(entry) {
    return {
      id: entry.id,
      url: entry.url,
      method: entry.method,
      type: entry.type,
      domain: entry.domain,
      statusCode: entry.statusCode,
      statusText: entry.statusText,
      requestHeaders: entry.requestHeaders || {},
      requestBody: entry.requestBody || '',
      responseHeaders: entry.responseHeaders || {},
      responseBody: entry.responseBody || '',
      responseSize: entry.responseSize || 0,
      contentType: entry.contentType || '',
      fromCache: entry.fromCache || false,
      error: entry.error || null,
      duration: entry.duration || 0,
      timestamp: entry.timestamp,
      tabId: entry.tabId,
      frameId: entry.frameId
    };
  }
};

// Export for different contexts
if (typeof window !== 'undefined') {
  window.APIExport = APIExport;
}
if (typeof self !== 'undefined') {
  self.APIExport = APIExport;
}
