# YouTube Khoai Add-on — single project index

This file is the canonical entry point for the YouTube addon in this repository.

## Project
- Root: `youtube-khoai-service/`
- Main server: `youtube-khoai-service/server.js`
- Persisted catalog data: `youtube-khoai-service/channels-catalog.json`
- Original Khoai catalog: `youtube-khoai-service/catalog.json`
- Film4K adapter: `youtube-khoai-service/film4k_adapter.js`
- Direct YouTube test: `youtube-khoai-service/direct_youtube_test.js`
- Cloudflare Worker: `youtube-khoai`

## Separate catalogs — do not merge
| key | catalog id | prefix | handle | source behavior |
|---|---|---|---|---|
| khoai | khoai-lang-thang | khoai_ | @khoailangthang | persisted catalog.json / 254 videos |
| hoaban | hoa-ban-food | hoaban_ | @HOABANFOOD | original runtime loader loadHoa() in server.js |
| bombom | bom-bom-vlog | bombom_ | @bombomvlog0310 | original runtime loader loadExtra() in server.js |
| sang | sang-vlog | sang_ | @sangvlog9 | original runtime loader loadExtra() in server.js |

## Historical commits that prove the old implementation
- `08f11e897dc750610abcbbca0e7a2484b67a4238` — add BomBom + Sang loader/catalog implementation.
- `7e47f902be8a8a2e1cc94a5ef3e99d904f871124` — add BomBom + Sang catalogs to manifest.
- `277414ef316ebe51f43ff8120d183ee20e550ec8` — restore separate YouTube channel catalogs.

## Data provenance rule
Do not treat a newly re-scraped YouTube result as historical/persisted addon data. On 2026-10-12 all newly re-scanned Hoa Ban/BomBom/Sang video rows and the temporary scheduled sync workflow were removed at user request. Preserve original runtime implementation/history and retrieve old data from existing historical/runtime sources before any new scan.

## Required catalog layout
Keep Khoai Lang Thang, HOA BAN FOOD, BomBom Vlog, Sang vlog, TEST Film4K, and TEST YouTube Direct as separate catalogs under this one addon/service.
