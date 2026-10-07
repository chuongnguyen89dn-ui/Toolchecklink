# Film4K HLS adapter

Upload `film4k_adapter.js` and `package.json` to a Node service.

Set `RESOLVER_BASE` to your resolver service. The resolver is responsible for acquiring an authorized playback session and must expose:

`GET /resolve/:slug`

JSON contract:

```json
{
  "video": {"url":"https://.../video.m3u8","body":"#EXTM3U..."},
  "audio": {"url":"https://.../audio.m3u8","body":"#EXTM3U..."},
  "media": {
    "video": {"init":"https://...","segments":["https://...","https://..."]},
    "audio": {"init":"https://...","segments":["https://...","https://..."]}
  },
  "headers": {"User-Agent":"...","Referer":"..."}
}
```

Do not put cookies, play tickets, opaque session URLs, or other live credentials in the repository. Return them only at runtime if your authorized resolver requires them.

Adapter output:

- `/film4k/<slug>/master.m3u8`
- `/film4k/<slug>/video.m3u8`
- `/film4k/<slug>/audio.m3u8`
- `/film4k/<slug>/media/video/<index|init>`
- `/film4k/<slug>/media/audio/<index|init>`

It preserves the full VOD media playlist, rewrites init/segment URIs, and strips a PNG wrapper through the PNG `IEND` chunk before returning the underlying fMP4 payload.
