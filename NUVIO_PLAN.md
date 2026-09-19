# Nuvio add-on plan

Do not store only expiring media URLs.

Flow:
catalog/meta -> stream request -> resolver recipe -> refresh if expired -> verify -> return current playable stream.

The desktop scanner and Nuvio resolver share the same normalized fields:
- source page
- media type
- stream URL
- detector/engine
- required request context
- verification status
- expiry hints
- metadata (title/episode when available)

This is intentionally compatible with the same resolver-first approach used in the earlier PhimHD-style add-on work.
