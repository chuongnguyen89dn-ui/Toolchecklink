# Toolchecklink architecture

Goal: reuse mature upstream components where licensing permits, and write only adapters/orchestration that are missing.

## Parallel detector lanes
1. Browser lane: Patchright/Chromium style network interception + DOM/performance/frame discovery.
2. Extension lane: TexHub/StreamDownloader techniques for URL + MIME + fetch/XHR + HLS/DASH discovery.
3. External resolver lane: yt-dlp and Streamlink when installed.
4. Verification lane: manifest/direct HTTP validation and later FFmpeg/segment verification.
5. Report lane: normalize all detector results into one JSON contract.
6. Add-on lane (next phase): consume the same normalized resolver contract for Nuvio.

## Upstream policy
- TexhubPro/texhub-video-downloader: MIT; suitable for direct reuse with attribution.
- izamashidog/StreamDownloader: MIT; suitable for direct reuse with attribution.
- 54ac/stream-detector: MPL-2.0; keep reused/modified MPL files isolated and preserve notices/source obligations.
- StasonJatham/m3u8_dl: no direct code copied until repository/file licensing is confirmed.
- yt-dlp / Streamlink: invoke as external engines rather than copying their implementations.

The report must identify which detector produced each candidate and why verification passed/failed.
