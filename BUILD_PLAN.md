# Active build plan

## Already working
- Windows GitHub Actions build
- Playwright browser capture
- DOM/performance/frame discovery
- HLS/DASH/direct candidate classification
- JSON export

## Prepared in parallel
- HLS chain inspector: manifest -> variant -> first media segment
- External resolver adapters: yt-dlp and Streamlink when present
- Normalized Level 1..5 report contract

## Next integration
Wire the independent modules into the scanner, then add batch/sitemap input and GUI. Access-control/DRM bypass is intentionally out of scope.
