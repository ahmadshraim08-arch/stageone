/**
 * Upload helpers for StageOne mobile.
 * Uses XMLHttpRequest so progress events are available.
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
    xhr.timeout = 5 * 60 * 1000; // 5 min

    xhr.send(formData);
  });
}

/**
 * Upload a video file to object storage.
 * @param uri        Local file URI (from ImagePicker)
 * @param mimeType   MIME type of the file (e.g. "video/mp4")
 * @param token      Clerk session token
 * @param onProgress Optional callback called with 0–100 progress
 */
export async function uploadVideo(
  uri: string,
  mimeType: string,
  token: string,
  onProgress?: UploadProgressCallback,
): Promise<UploadVideoResult> {
  const base = apiBase();
  const form = new FormData();
  const filename = uri.split("/").pop() ?? "video.mp4";
  form.append("video", { uri, name: filename, type: mimeType } as unknown as Blob);

  return xhrUpload<UploadVideoResult>(
    `${base}/uploads/video`,
    form,
    token,
    onProgress,
  );
}

/**
 * Upload an avatar image to object storage.
 * @param uri      Local file URI (from ImagePicker)
 * @param mimeType MIME type of the file (e.g. "image/jpeg")
 * @param token    Clerk session token
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
