/**
 * Upload helpers for StageOne mobile.
 *
 * Video upload uses a two-phase direct-to-GCS approach to avoid the
 * Replit reverse-proxy timeout and memory-buffering issues:
 *   Phase A — POST /uploads/video/sign  → get a signed GCS PUT URL
 *   Phase B — PUT directly to GCS       → progress events work (Content-Length is known)
 *   Phase C — POST /uploads/video/confirm → verify + make public + return permanent URL
 */

import * as FileSystem from "expo-file-system/legacy";

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
  objectKey: string;
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
 *   0      = starting
 *   1–90   = phase B real upload progress (or indeterminate pulse when Content-Length unknown)
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
  const uploadRequestId = Math.random().toString(36).slice(2, 10);
  const filename = uri.split("/").pop() ?? "video";
  const uriScheme = uri.split(":")[0] ?? "unknown";
  const startMs = Date.now();

  // ── Pre-flight: probe file info for diagnostics ──────────────────────────────
  let fileSizeBytes = 0;
  let fileSizeMb = "unknown";
  let cacheFileExists = false;
  try {
    // Cast options to bypass legacy type gap — `size: true` is supported at runtime
    type FsInfo = { exists: boolean; uri: string; size?: number };
    const info = await (
      FileSystem.getInfoAsync as (uri: string, opts?: object) => Promise<FsInfo>
    )(uri, { size: true });
    if (info.exists) {
      fileSizeBytes = info.size ?? 0;
      fileSizeMb = (fileSizeBytes / 1_048_576).toFixed(2);
      cacheFileExists = true;
    }
  } catch (e) {
    console.warn(`[upload:${uploadRequestId}] getInfoAsync failed:`, e);
  }

  console.log(`[upload:${uploadRequestId}] Starting`, {
    filename,
    mimeType,
    uriScheme,
    fileSizeMb,
    fileSizeBytes,
    cacheFileExists,
  });
  onProgress?.(0);

  // ─── Phase A: get signed PUT URL ───────────────────────────────────────────
  const signRes = await fetch(`${base}/uploads/video/sign`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ mimeType, uploadRequestId }),
  });
  if (!signRes.ok) {
    let message = `Could not prepare upload (HTTP ${signRes.status})`;
    try {
      const body = (await signRes.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {}
    throw new Error(message);
  }
  const { signedUrl, objectKey } = (await signRes.json()) as {
    signedUrl: string;
    objectKey: string;
  };
  const phaseAMs = Date.now() - startMs;
  console.log(
    `[upload:${uploadRequestId}] Phase A done in ${phaseAMs}ms, objectKey prefix:`,
    objectKey.slice(0, 50),
  );

  // ─── Phase B: PUT binary directly to GCS (no Replit proxy in the path) ────
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("Content-Type", mimeType);

    // Indeterminate progress fallback: when RN XHR doesn't fire lengthComputable
    // events, pulse the bar slowly so the user sees activity rather than a frozen 0%.
    let indeterminateTimer: ReturnType<typeof setInterval> | null = null;
    let indeterminatePct = 1;
    let usingRealProgress = false;

    if (onProgress) {
      // Start indeterminate pulse immediately; cancel if real progress arrives.
      onProgress(1);
      indeterminatePct = 1;
      indeterminateTimer = setInterval(() => {
        if (!usingRealProgress) {
          indeterminatePct = Math.min(85, indeterminatePct + 2);
          onProgress(indeterminatePct);
        }
      }, 1500);
    }

    if (onProgress && xhr.upload) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          // Real progress available — cancel the indeterminate pulse
          if (indeterminateTimer && !usingRealProgress) {
            clearInterval(indeterminateTimer);
            indeterminateTimer = null;
          }
          usingRealProgress = true;
          onProgress(Math.min(90, Math.max(1, Math.round((e.loaded / e.total) * 90))));
        }
      };
    }

    const cleanup = () => {
      if (indeterminateTimer) {
        clearInterval(indeterminateTimer);
        indeterminateTimer = null;
      }
    };

    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Storage upload failed (HTTP ${xhr.status})`));
      }
    };
    xhr.onerror = () => {
      cleanup();
      reject(new Error("Network error during upload to storage"));
    };
    xhr.ontimeout = () => {
      cleanup();
      reject(new Error("Upload timed out — keep the app open and try again"));
    };
    xhr.timeout = 10 * 60 * 1000; // 10 min for large files

    // React Native XHR supports sending a file URI as raw binary body
    xhr.send({ uri, type: mimeType, name: filename } as unknown as Blob);
  });

  const phaseBMs = Date.now() - startMs - phaseAMs;
  console.log(
    `[upload:${uploadRequestId}] Phase B done in ${phaseBMs}ms (GCS PUT, ${fileSizeMb} MB)`,
  );
  onProgress?.(95);

  // ─── Phase C: confirm with server (verify + makePublic + return URL) ────────
  const confirmRes = await fetch(`${base}/uploads/video/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ objectKey, mimeType, uploadRequestId }),
  });
  if (!confirmRes.ok) {
    let message = `Could not finalize upload (HTTP ${confirmRes.status})`;
    try {
      const body = (await confirmRes.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {}
    throw new Error(message);
  }
  const result = (await confirmRes.json()) as {
    videoUrl: string;
    thumbnailUrl: string | null;
    objectKey: string;
  };

  const totalMs = Date.now() - startMs;
  console.log(`[upload:${uploadRequestId}] Complete`, {
    totalMs,
    fileSizeBytes,
    fileSizeMb,
    throughputMbps: fileSizeBytes > 0
      ? ((fileSizeBytes / 1_048_576) / (totalMs / 1000)).toFixed(2)
      : "n/a",
    videoUrl: result.videoUrl.slice(0, 60),
  });
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
    videoObjectKey?: string;
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
    lyricSectionLabel?: string;
    lyricSectionStartMs?: number;
    lyricSectionEndMs?: number;
    lyricSectionStartLine?: number;
    lyricSectionEndLine?: number;
    lyricTimingMode?: string;
    lyricTimingOffsetMs?: number;
    lyricTimingAnchors?: object | null;
    lyricStartWord?: number;
    lyricEndWord?: number;
    rightsConfirmed?: boolean;
    // AI analysis fields
    analysisJobId?: string;
    detectedTrackId?: string;
    songMatchConfidence?: number;
    vocalIsolationUsed?: boolean;
    transcriptionSource?: string;
    cyaniteGenre?: string;
    cyaniteMoods?: string[];
    cyaniteEnergy?: string;
    audioAnalysisSource?: string;
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
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {}
    throw new Error(message);
  }
  return res.json() as Promise<{ id: number }>;
}
