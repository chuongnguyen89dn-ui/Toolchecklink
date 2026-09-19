# Toolchecklink

Windows media inspection tool.

Paste a page URL, let Chromium load the page, observe media-related network/DOM activity, verify accessible HLS/DASH/direct-media candidates, and export a JSON report after every run. The JSON contract is also the foundation for a later Nuvio-compatible resolver/add-on.

## v0.1
- Playwright Chromium
- Network request/response capture
- DOM video/source scan
- iframe + Performance Resource discovery
- HLS / DASH / MP4-WebM detection
- basic manifest verification
- JSON report every run
- Windows EXE build via GitHub Actions

Use only with media you are authorized to access. DRM may be detected/reported but is not bypassed.
