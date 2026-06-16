/**
 * Typed API client for StageOne mobile.
 * Attaches Clerk Bearer token on every authenticated request.
 * Base URL: EXPO_PUBLIC_API_URL → EXPO_PUBLIC_DOMAIN → /api (dev proxy).
 */

let _lastError: string | null = null;

export function getLastApiError(): string | null {
  return _lastError;
}
export function clearLastApiError(): void {
  _lastError = null;
}

export function apiBase(): string {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (apiUrl) return apiUrl;
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  return `/api`;
}

async function apiFetch<T>(
  path: string,
  token: string | null,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${apiBase()}${path}`, { ...options, headers });
  if (!res.ok) {
    let msg = `API ${path} → HTTP ${res.status}`;
    try {
      const b = (await res.json()) as { error?: string };
      if (b.error) msg = b.error;
    } catch {}
    _lastError = `[${new Date().toISOString()}] ${msg}`;
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type");
  if (!ct?.includes("application/json")) return undefined as T;
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface ApiUser {
  id: number;
  clerkId: string;
  username: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  goldenMicBalance: number;
  genres: string[];
  languages?: string[];
  postCount: number;
  followerCount: number;
  followingCount: number;
  goldenMicsReceived: number;
  viewerIsFollowing?: boolean;
  createdAt?: string;
}

export interface ApiPost {
  id: number;
  userId: number;
  videoUrl: string;
  thumbnailUrl: string | null;
  title: string;
  caption: string | null;
  performanceType: string;
  genre: string | null;
  language: string | null;
  musixmatchTrackId: string | null;
  trackTitle: string | null;
  trackArtist: string | null;
  lyricSectionId: string | null;
  rightsConfirmed: boolean;
  goldenMicCount: number;
  createdAt: string;
  creator: {
    id: number;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  likesCount: number;
  commentsCount: number;
  savesCount: number;
  viewerHasLiked: boolean;
  viewerHasSaved: boolean;
  viewerIsFollowing: boolean;
}

export interface ApiComment {
  id: number;
  postId: number;
  body: string;
  createdAt: string;
  creator: {
    id: number;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

export interface ApiConversation {
  id: number;
  createdAt: string;
  otherUser: {
    id: number;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  lastMessage: { body: string; sentAt: string } | null;
  unreadCount: number;
}

export interface ApiMessage {
  id: number;
  conversationId: number;
  senderId: number;
  body: string;
  sentAt: string;
  readAt: string | null;
}

export interface ApiNotification {
  id: number;
  type: string;
  postId: number | null;
  postTitle: string | null;
  postThumbnailUrl: string | null;
  createdAt: string;
  readAt: string | null;
  actor: {
    id: number;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  } | null;
}

export interface HealthResponse {
  api: string;
  db: string;
  musixmatch: string;
  storage?: string;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const upsertMe = (
  token: string,
  body: { username?: string; displayName?: string; avatarUrl?: string },
): Promise<ApiUser> =>
  apiFetch<ApiUser>("/auth/me", token, { method: "POST", body: JSON.stringify(body) });

export const getMe = (token: string): Promise<ApiUser> =>
  apiFetch<ApiUser>("/auth/me", token);

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

export const getPosts = (
  token: string | null,
  params: { feed?: string; userId?: number; cursor?: string; limit?: number } = {},
): Promise<{ items: ApiPost[]; nextCursor: string | null }> => {
  const q = new URLSearchParams();
  if (params.feed) q.set("feed", params.feed);
  if (params.userId !== undefined) q.set("userId", String(params.userId));
  if (params.cursor !== undefined) q.set("cursor", params.cursor);
  if (params.limit !== undefined) q.set("limit", String(params.limit));
  const qs = q.toString();
  return apiFetch(`/posts${qs ? `?${qs}` : ""}`, token);
};

export const recordPostView = (
  token: string,
  postId: number,
  watchDurationMs: number,
): Promise<void> =>
  apiFetch<void>(`/posts/${postId}/view`, token, {
    method: "POST",
    body: JSON.stringify({ watchDurationMs }),
  });

// ---------------------------------------------------------------------------
// Likes / Saves / Comments / Golden Mic
// ---------------------------------------------------------------------------

export const likePost = (token: string, postId: number) =>
  apiFetch<{ liked: boolean; likesCount: number }>(`/posts/${postId}/like`, token, { method: "POST" });

export const unlikePost = (token: string, postId: number) =>
  apiFetch<{ liked: boolean; likesCount: number }>(`/posts/${postId}/like`, token, { method: "DELETE" });

export const savePost = (token: string, postId: number) =>
  apiFetch<{ saved: boolean }>(`/posts/${postId}/save`, token, { method: "POST" });

export const unsavePost = (token: string, postId: number) =>
  apiFetch<{ saved: boolean }>(`/posts/${postId}/save`, token, { method: "DELETE" });

export const getComments = (token: string, postId: number, cursor?: number) =>
  apiFetch<{ items: ApiComment[]; nextCursor: number | null }>(
    `/posts/${postId}/comments${cursor !== undefined ? `?cursor=${cursor}` : ""}`,
    token,
  );

export const postComment = (token: string, postId: number, body: string) =>
  apiFetch<ApiComment>(`/posts/${postId}/comments`, token, {
    method: "POST",
    body: JSON.stringify({ body }),
  });

export const sendGoldenMicApi = (token: string, postId: number, amount = 1) =>
  apiFetch<{ goldenMicCount: number; senderBalance: number }>(`/posts/${postId}/golden-mic`, token, {
    method: "POST",
    body: JSON.stringify({ amount }),
  });

// ---------------------------------------------------------------------------
// Follows
// ---------------------------------------------------------------------------

export const followUser = (token: string, userId: number) =>
  apiFetch<{ following: boolean }>(`/follows/${userId}`, token, { method: "POST" });

export const unfollowUser = (token: string, userId: number) =>
  apiFetch<{ following: boolean }>(`/follows/${userId}`, token, { method: "DELETE" });

// ---------------------------------------------------------------------------
// Conversations / Messages
// ---------------------------------------------------------------------------

export const getConversations = (token: string) =>
  apiFetch<{ items: ApiConversation[] }>("/conversations", token);

export const createOrGetConversation = (token: string, recipientId: number) =>
  apiFetch<{ id: number }>("/conversations", token, {
    method: "POST",
    body: JSON.stringify({ recipientId }),
  });

export const getMessages = (token: string, convId: number, cursor?: number) =>
  apiFetch<{ items: ApiMessage[]; nextCursor: number | null }>(
    `/conversations/${convId}/messages${cursor !== undefined ? `?cursor=${cursor}` : ""}`,
    token,
  );

export const sendMessage = (
  token: string,
  convId: number,
  payload: { type: "text"; text: string } | { type: "music_minute_share"; musicMinuteId: string },
) =>
  apiFetch<ApiMessage>(`/conversations/${convId}/messages`, token, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const markConversationRead = (token: string, convId: number) =>
  apiFetch<void>(`/conversations/${convId}/read`, token, { method: "POST" });

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export const getPost = (token: string | null, postId: number): Promise<ApiPost> =>
  apiFetch<ApiPost>(`/posts/${postId}`, token);

export const getNotifications = (token: string, cursor?: number) =>
  apiFetch<{ items: ApiNotification[]; nextCursor: number | null }>(
    `/notifications${cursor !== undefined ? `?cursor=${cursor}` : ""}`,
    token,
  );

export const markNotificationsRead = (token: string) =>
  apiFetch<void>("/notifications/read", token, { method: "POST" });

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const getUserByUsername = (token: string | null, username: string): Promise<ApiUser> =>
  apiFetch<ApiUser>(`/users/${encodeURIComponent(username)}`, token);

export const patchMe = (
  token: string,
  body: { displayName?: string; bio?: string; avatarUrl?: string; genres?: string[]; languages?: string[] },
): Promise<ApiUser> =>
  apiFetch<ApiUser>("/users/me", token, { method: "PATCH", body: JSON.stringify(body) });

export const getUnreadCounts = (token: string) =>
  apiFetch<{ messages: number; notifications: number }>("/users/me/unread", token);

export const registerPushToken = (token: string, pushToken: string) =>
  apiFetch<void>("/users/me/push-token", token, {
    method: "POST",
    body: JSON.stringify({ token: pushToken }),
  });

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export const checkHealth = (): Promise<HealthResponse> =>
  apiFetch<HealthResponse>("/healthz", null);
