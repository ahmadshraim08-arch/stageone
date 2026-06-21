---
name: Thumbnail/ffmpeg SSRF guard
description: Why video thumbnail generation must derive its ffmpeg input from a validated object key, never a client URL.
---

# Server-side media generation must not consume client-supplied URLs

When generating a video thumbnail (or any ffmpeg/server-side fetch) at post
creation, never pass the client-supplied `videoUrl` to ffmpeg — that is an SSRF
sink (attacker can submit arbitrary URLs/protocols, e.g. `http://169.254.169.254/...`).

**Rule:** derive the ffmpeg input URL server-side from the validated
`videoObjectKey`. Validate the key against the trusted bucket + prefix from
`PRIVATE_OBJECT_DIR` (same check `uploads.ts` `/uploads/video/confirm` uses:
`bucket === expectedBucket && objectName.startsWith(".private/videos/")`), then
`signVideoGetUrl(bucket, objectName)`. If the key is missing/invalid, skip
generation (best-effort null) — do not fall back to the client URL.

**Why:** code review rejected the first pass for exactly this. The trusted-prefix
validation logic is duplicated in `routes/posts.ts` (`getExpectedVideoPrefix` /
`signValidatedVideoGetUrl`) and `routes/uploads.ts` (`getVideoObjectKeyPrefix`) —
keep them consistent; a shared lib would be the clean refactor.

**How to apply:** any new server-side feature that fetches/processes a media URL
on behalf of a user must start from a server-minted/validated object key, not a
URL field in the request body.
