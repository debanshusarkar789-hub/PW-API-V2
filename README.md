Here is a professional README.md for your **Advanced API Capture** Chrome extension.
# 🔍 Advanced API Capture

[![Version](https://img.shields.io/badge/version-3.0.0-red.svg)](https://github.com/)
[![Manifest](https://img.shields.io/badge/Manifest-V3-blue.svg)](https://developer.chrome.com/docs/extensions/mv3/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](https://opensource.org/licenses/MIT)

A professional-grade Chrome extension for network traffic analysis, API inspection, and security research. Captures ALL requests/responses with unlimited storage and advanced filtering.

![Preview](https://via.placeholder.com/800x450?text=Advanced+API+Capture+Extension)

---

## ✨ Features

### 🎯 Capture Capabilities
- ✅ **ALL network requests** (GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH)
- ✅ **Full request/response headers** with syntax highlighting
- ✅ **Request bodies and response bodies** (JSON/XML/HTML/Text)
- ✅ **Timing information** (duration, start/end time)
- ✅ **Error tracking** with detailed error messages
- ✅ **Server IP addresses** and CDN information

### 🎛️ Capture Modes
| Mode | Description |
|------|-------------|
| **All URLs** | Capture every request from every domain |
| **Target Domains** | Only capture requests from specific domains (e.g., `api.penpencil.co`) |
| **Custom Regex** | Capture URLs matching your custom patterns |

### 💾 Storage & Limits
- Configurable max entries (100 to 50,000)
- Automatic cleanup when limit reached
- Persistent storage via `chrome.storage.local`
- Unlimited storage for your research

### 📤 Export Formats

| Format | Use Case |
|--------|----------|
| **JSON** | Full detailed export with metadata |
| **CSV** | Spreadsheet compatible analysis |
| **HAR** | Import into Chrome DevTools, Fiddler, Charles |
| **NDJSON** | Newline-delimited for streaming import |
| **SQL** | Direct database INSERT statements |
| **Markdown** | Quick preview in documentation |

### 🎨 User Interface
- **Dark theme** (#0a0a0f background, #e94560 accent)
- **Real-time auto-refresh** (every 2 seconds)
- **Search with debounce** (300ms)
- **Type filters** (Request/Response/Body/Error)
- **Status code filters** (200, 201, 400, 401, 403, 404, 500)
- **Expandable entries** with full detail view
- **JSON syntax highlighting** (keys, strings, numbers, booleans, null)
- **Copy-to-clipboard** for response bodies
- **Pagination** with page controls
- **Statistics dashboard** (total, requests, responses, errors, domains, storage)

### 🏷️ Visual Badges
- **Method badges**: GET=green, POST=yellow, PUT=blue, DELETE=red
- **Status badges**: 2xx=green, 4xx=yellow, 5xx=red
- **Category badges**: Auth, OTP, Manifest, Segment

### ⚙️ Settings Page
- Max entries configuration (100-50000)
- Auto-export toggle
- Headers capture toggle
- Bodies capture toggle
- Error highlighting toggle
- Theme selector (Dark/Light/System)
- Notification settings
- Sound on error
- Data management (Export/Clear)

---

## 📥 Installation

### From Source (Developer Mode)

1. **Clone or download** this repository
   ```bash
   git clone https://github.com/yourusername/advanced-api-capture.git
   ```

2. **Open Chrome** and navigate to `chrome://extensions/`

3. **Enable Developer mode** (toggle in top right)

4. **Click "Load unpacked"**

5. **Select the extension folder**

6. **The extension icon appears** in your toolbar

### File Structure
```
advanced-api-capture/
├── manifest.json          # Extension manifest (MV3)
├── background.js          # Service worker (1,102 lines)
├── content.js             # Fetch/XHR interceptor (351 lines)
├── popup.html / .css / .js # Main popup UI (2,323 lines)
├── options.html / .css / .js # Settings page (1,258 lines)
├── lib/
│   └── export.js          # Export formats library (306 lines)
└── icons/                 # 16px, 48px, 128px PNG icons
```

---

## 🚀 Quick Start

### Step 1: Configure Target Domains

1. Click the extension icon
2. Click the **gear icon** (🎯 Configure Targets)
3. Add domains you want to monitor (one per line)
4. Click **Save**
5. Select **"Target Domains"** mode

### Step 2: Start Capturing

- Ensure **"Capturing"** shows green dot
- Navigate to your target website
- Watch entries appear in real-time

### Step 3: Filter & Analyze

- Use **search** to find specific endpoints
- Use **type filters** to isolate requests/responses
- Use **status filters** to find errors
- **Click any entry** to expand and view details

### Step 4: Export Data

- Click **Export** button (📥 icon)
- Choose format (JSON, CSV, HAR, NDJSON, SQL, Markdown)
- Save for analysis

---

## 🎯 Use Cases

### Security Research
- Capture API authentication flows
- Analyze token generation patterns
- Inspect signed URL mechanisms
- Document API endpoints

### API Development
- Debug API integration issues
- Inspect request/response structures
- Monitor rate limiting and errors
- Generate API documentation

### Performance Analysis
- Track response times
- Identify slow endpoints
- Analyze CDN performance
- Monitor cache behavior

### Data Extraction
- Export API responses for analysis
- Generate SQL for database storage
- Create HAR files for replay tools

---

## 📋 Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+F` | Focus search bar |
| `Ctrl+Shift+A` | Toggle capture on/off |
| `Ctrl+Shift+X` | Export current data |
| `Ctrl+Shift+C` | Clear all captured data |
| `Ctrl+Shift+R` | Refresh view |

---

## 🔧 Advanced Usage

### Custom Regex Patterns

```
# Capture all video-related requests
.*\.mp4.*
.*master\.mpd.*
.*\.m3u8.*

# Capture specific API version
.*/v3/.*
.*/v1/videos/.*

# Capture authentication flows
.*/oauth/.*
.*/verify-token.*
```

### Target Domains Example

```
api.penpencil.co
sec-prod-mediacdn.pw.live
www.pw.live
api.pw.live
static.pw.live
```

### Export as HAR for DevTools

1. Click **Export** → Select **HAR format**
2. Open Chrome DevTools (`F12`)
3. Go to **Network** tab
4. Click **Import HAR file** (⬆️ icon)
5. Analyze in familiar DevTools interface

---

## 🛠️ Development

### Prerequisites
- Node.js (for building, optional)
- Chrome/Edge browser

### Build from source
```bash
# Clone the repository
git clone https://github.com/yourusername/advanced-api-capture.git
cd advanced-api-capture

# Install dependencies (optional, for development)
npm install

# Load unpacked extension in Chrome
# chrome://extensions/ → Load unpacked → Select folder
```

### Running Tests
```bash
# Manual testing
# 1. Load extension
# 2. Navigate to test website
# 3. Verify capture functionality

# Automated tests (coming soon)
npm test
```

---

## 📊 Statistics Dashboard

The extension provides real-time statistics:

| Statistic | Description |
|-----------|-------------|
| **Total entries** | Total captured requests/responses |
| **Request count** | Number of request events |
| **Response count** | Number of response events |
| **Error count** | Number of failed requests |
| **Storage size** | Approximate size of captured data |
| **Unique domains** | All domains captured |
| **Status code distribution** | 2xx, 4xx, 5xx breakdown |

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow existing code style
- Add comments for complex logic
- Test thoroughly before submitting
- Update documentation as needed

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## ⚠️ Disclaimer

This tool is intended for:
- ✅ Authorized security research
- ✅ Debugging your own applications
- ✅ Learning about API architectures
- ✅ Performance analysis

This tool is NOT intended for:
- ❌ Bypassing authentication/authorization
- ❌ Stealing sensitive data
- ❌ Violating terms of service
- ❌ Unauthorized access to APIs

**Use responsibly and only on systems you own or have permission to test.**

---

## 📞 Support

| Issue Type | Contact |
|------------|---------|
| Bug reports | [Open an issue](https://github.com/yourusername/advanced-api-capture/issues) |
| Feature requests | [Open a discussion](https://github.com/yourusername/advanced-api-capture/discussions) |
| Security concerns | Email: security@yourdomain.com |

---

## 🙏 Acknowledgments

- Chrome Extensions documentation
- WebRequest API contributors
- DASH.js team for video player reference
- Open source community

---

## 📈 Version History

| Version | Date | Changes |
|---------|------|---------|
| 3.0.0 | 2026-05-03 | Complete rewrite, dark theme, 6 export formats |
| 2.0.0 | 2026-04-20 | Added capture modes, settings page |
| 1.0.0 | 2026-04-15 | Initial release |

---

## 🔮 Roadmap

- [ ] WebSocket capture support
- [ ] GraphQL query/response parsing
- [ ] Request replay functionality
- [ ] Diff tool for comparing requests
- [ ] Cloud backup integration
- [ ] Team collaboration features
- [ ] Automated API documentation generation

---

**Built with ❤️ for security researchers and developers**

```

---

This README includes:

| Section | Content |
|---------|---------|
| **Features** | Complete feature list with tables |
| **Installation** | Step-by-step setup guide |
| **Quick Start** | 4-step getting started guide |
| **Use Cases** | Security research, API dev, performance |
| **Shortcuts** | Keyboard shortcuts table |
| **Advanced Usage** | Regex patterns, domain examples |
| **Development** | Build instructions |
| **Statistics** | Dashboard metrics |
| **Contributing** | Guidelines for contributors |
| **Disclaimer** | Legal/ethical usage notice |
| **Roadmap** | Future features |

Replace placeholder links (GitHub URLs, email, images) with your actual links before publishing.
