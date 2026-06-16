/**
 * Upload helpers for StageOne mobile.
 *
 * Video upload uses a two-phase direct-to-GCS approach to avoid the
 * Replit reverse-proxy timeout and memory-buffering issues:
 *   Phase A — POST /uploads/video/sign  → get a signed GCS PUT URL
 *   Phase B — PUT directly to GCS       → progress events work (Content-Length is known)
 *   Phase C — POST /uploads/video/confirm → verify + make public + return permanent URL
 */

function apiBase(): string {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (apiUrl) return apiUrl.replace(/\/$/, "");
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  return `/api`;
}

export interface UploadVideoResult {
  videoUrl: string;
  thumbnailUrl: string | null;
}

export interface UploadAvatarResult {
  avatarUrl: string;
}

export type UploadProgressCallback = (pct: number) => void;

function xhrUpload<T>(
  url: string,
  formData: FormData,
  token: string,
  onProgress?: UploadProgressCallback,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    if (onProgress && xhr.upload) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as T);
        } catch {
          reject(new Error("Invalid JSON response from upload endpoint"));
        }
      } else {
        let message = `Upload failed (HTTP ${xhr.status})`;
        try {
          const body = JSON.parse(xhr.responseText) as { error?: string };
          if (body.error) message = body.error;
        } catch {}
        reject(new Error(message));
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));
    xhr.timeout = 5 * 60 * 1000;

    xhr.send(formData);
  });
}

/**
 * Upload a video file to object storage using a two-phase direct-to-GCS approach.
 *
 * Phase A: Request a 15-min signed PUT URL from the server.
 * Phase B: PUT raw binary directly to GCS (bypasses Replit proxy; real progress available).
 * Phase C: Confirm with the server (verify object exists, make public, get permanent URL).
 *
 * Progress callback receives 0–100:
 *   0      = starting phase A
 *   1–90   = phase B upload progress (real bytes if Content-Length is computable)
 *   95     = phase B complete, awaiting confirm
 *   100    = fully confirmed
 */
export async function uploadVideo(
  uri: string,
  mimeType: string,
  token: string,
  onProgress?: UploadProgressCallback,
): Promise<UploadVideoResult> {
  const base = apiBase();
  const requestId = Math.random().toString(36).slice(2, 10);
  const filename = uri.split("/").pop() ?? "video";
  const uriScheme = uri.split(":")[0] ?? "unknown";

  console.log(`[upload:${requestId}] Starting`, { filename, mimeType, uriScheme });
  onProgress?.(0);

  // ─── Phase A: get signed PUT URL ───────────────────────────────────────────
  const signRes = await fetch(`${base}/uploads/video/sign`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ mimeType }),
  });
  if (!signRes.ok) {
    let message = `Could not prepare upload (HTTP ${signRes.status})`;
    try {
      const body = await signRes.json() as { error?: string };
      if (body.error) message = body.error;
    } catch {}
    throw new Error(message);
  }
  const { signedUrl, objectKey } = await signRes.json() as {
    signedUrl: string;
    objectKey: string;
  };
  console.log(`[upload:${requestId}] Phase A done, objectKey prefix:`, objectKey.slice(0, 40));

  // ─── Phase B: PUT binary directly to GCS (no Replit proxy in the path) ────
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("Content-Type", mimeType);

    if (onProgress && xhr.upload) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.min(90, Math.round((e.loaded / e.total) * 90)));
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Storage upload failed (HTTP ${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload to storage"));
    xhr.ontimeout = () => reject(new Error("Upload timed out — keep the app open and try again"));
    xhr.timeout = 10 * 60 * 1000; // 10 min for large files

    // React Native XHR supports sending a file URI as raw binary body
    xhr.send({ uri, type: mimeType, name: filename } as unknown as Blob);
  });

  console.log(`[upload:${requestId}] Phase B done (GCS PUT complete)`);
  onProgress?.(95);

  // ─── Phase C: confirm with server (verify + makePublic + return URL) ────────
  const confirmRes = await fetch(`${base}/uploads/video/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ objectKey, mimeType }),
  });
  if (!confirmRes.ok) {
    let message = `Could not finalize upload (HTTP ${confirmRes.status})`;
    try {
      const body = await confirmRes.json() as { error?: string };
      if (body.error) message = body.error;
    } catch {}
    throw new Error(message);
  }
  const result = await confirmRes.json() as { videoUrl: string; thumbnailUrl: string | null };
  console.log(`[upload:${requestId}] Phase C done, URL:`, result.videoUrl.slice(0, 50));
  onProgress?.(100);
  return result;
}

/**
 * Upload an avatar image to object storage.
 */
export async function uploadAvatar(
  uri: string,
  mimeType: string,
  token: string,
): Promise<UploadAvatarResult> {
  const base = apiBase();
  const form = new FormData();
  const filename = uri.split("/").pop() ?? "avatar.jpg";
  form.append("avatar", { uri, name: filename, type: mimeType } as unknown as Blob);

  return xhrUpload<UploadAvatarResult>(`${base}/uploads/avatar`, form, token);
}

/**
 * Create a post via the backend API.
 */
export async function createPost(
  payload: {
    videoUrl: string;
    thumbnailUrl?: string;
    title: string;
    caption?: string;
    performanceType: string;
    genre?: string;
    language?: string;
    musixmatchTrackId?: string;
    trackTitle?: string;
    trackArtist?: string;
    lyricSectionId?: string;
    rightsConfirmed?: boolean;
  },
  token: string,
): Promise<{ id: number }> {
  const base = apiBase();
  const res = await fetch(`${base}/posts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let message = `Failed to create post (HTTP ${res.status})`;
    try {
      const body = await res.json() as { error?: string };
      if (body.error) message = body.error;
    } catch {}
    throw new Error(message);
  }
  return res.json() as Promise<{ id: number }>;
}
