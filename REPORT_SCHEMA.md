# Report schema

Every scan produces `toolchecklink_<host>_<timestamp>.json`.

Key fields:
- `input_url`, `final_url`, `title`
- `frames[]`
- `candidate_count`, `verified_count`
- `candidates[].url/type/source/content_type/status_seen/headers/verification`

Cookie and Authorization values are redacted from exported reports by default.

This contract will be extended for the Nuvio resolver/add-on layer.
