---
name: GCS public access prevention
description: Replit Object Storage bucket enforces public access prevention — makePublic() fails with HTTP 412, signed GET URLs must be used instead.
---

# Replit Object Storage — Public Access Prevention

The Replit-managed GCS bucket has **Uniform Bucket-Level Access + Public Access Prevention** enforced.

**What works:**
- `file.exists()` — ✓
- `file.getMetadata()` — ✓
- `bucket.getFiles()` — ✓
- Sidecar signed PUT URLs for upload — ✓
- Sidecar signed GET URLs for playback — ✓

**What fails:**
- `file.makePublic()` → HTTP 412 "allUsers bindings not allowed since public access prevention is enforced"
- Direct public `https://storage.googleapis.com/bucket/object` URLs — not accessible

**The fix:**
Instead of `makePublic()`, generate a signed GET URL via the sidecar:
```ts
POST http://127.0.0.1:1106/object-storage/signed-object-url
{ bucket_name, object_name, method: "GET", expires_at: <ISO> }
```
Max TTL is 7 days (604,800 seconds) for GCS V4 RSA signed URLs.

**Why:**
Public access prevention is a GCS security feature that blocks all `allUsers`/`allAuthenticatedUsers` IAM bindings at both object ACL and bucket IAM levels. Signed URLs bypass this by including a cryptographic signature in the URL itself rather than relying on IAM.

**How to apply:**
- Any video served from `.private/videos/` needs a signed GET URL for playback.
- Store the stable `video_object_key` (bucket/objectName) in the posts table.
- Re-sign with a fresh 7-day URL on every GET /posts and GET /posts/:id response.
- The `freshenVideoUrl()` helper in posts.ts handles this with fallback.
- Avatars in `uploadToGcs()` also call `makePublic()` — fix separately if needed.
