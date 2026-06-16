import { useAuth, useUser } from "@clerk/expo";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  MusicMinute,
  SEED_COMMENTS,
  SEED_MUSIC_MINUTES,
  SEED_USERS,
  SeedComment,
  User,
} from "@/data/seedData";
import {
  ApiPost,
  getComments as apiGetComments,
  getMe,
  getPosts,
  getUnreadCounts,
  followUser,
  unfollowUser,
  likePost,
  unlikePost,
  savePost,
  unsavePost,
  postComment as apiPostComment,
  sendGoldenMicApi,
  createOrGetConversation,
  sendMessage as apiSendMessage,
  upsertMe,
  patchMe,
} from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CurrentUser {
  id: string;
  dbId: number;
  username: string;
  displayName: string;
  email: string;
  bio: string;
  goldenMicBalance: number;
  genres: string[];
  isGuest: boolean;
  avatarUrl?: string | null;
  followerCount: number;
  followingCount: number;
  postCount: number;
}

export interface FollowedApiUser {
  dbId: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface DirectShare {
  id: string;
  senderId: string;
  senderDisplayName: string;
  senderUsername: string;
  senderAvatarColor: string;
  recipientId: string;
  musicMinuteId: string;
  musicMinuteTitle: string;
  message: string;
  createdAt: string;
  seenAt: string | null;
}

interface LoginData {
  username?: string;
  displayName?: string;
  genres?: string[];
  bio?: string;
}

interface AppContextType {
  currentUser: CurrentUser | null;
  musicMinutes: MusicMinute[];
  feedLoading: boolean;
  followingFeed: MusicMinute[];
  followingLoading: boolean;
  followedApiUsers: FollowedApiUser[];
  users: User[];
  likedIds: Set<string>;
  followingIds: Set<string>;
  savedIds: Set<string>;
  goldenMicsSent: Record<string, number>;
  comments: Record<string, SeedComment[]>;
  directShares: DirectShare[];
  unreadMessages: number;
  unreadNotifications: number;
  isLoaded: boolean;

  login: (data: LoginData) => Promise<void>;
  logout: () => void;
  signUp: (data: { username: string; displayName: string; email: string; genres: string[] }) => Promise<void>;
  updateAvatar: (avatarUrl: string) => void;
  toggleLike: (musicMinuteId: string) => void;
  toggleFollow: (userId: string) => void;
  toggleSave: (musicMinuteId: string) => void;
  sendGoldenMic: (musicMinuteId: string) => boolean;
  addGoldenMics: (quantity: number) => void;
  addComment: (musicMinuteId: string, content: string) => void;
  loadComments: (musicMinuteId: string) => Promise<void>;
  postMusicMinute: (
    mm: Omit<MusicMinute, "id" | "views" | "likesCount" | "commentsCount" | "sharesCount" | "savesCount" | "goldenMicsCount" | "createdAt" | "isRisingVoice" | "isFeatured">,
  ) => void;
  sendDirectShare: (recipientId: string, musicMinuteId: string, musicMinuteTitle: string, message: string) => boolean;
  getInboxShares: (userId: string) => DirectShare[];
  markShareSeen: (shareId: string) => void;
  refreshFeed: () => Promise<void>;
  fetchFollowingFeed: () => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const AVATAR_COLORS = ["#A855F7", "#EC4899", "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#6366F1"];

function avatarColorForUsername(username: string): string {
  let h = 0;
  for (const c of username) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export function apiPostToMusicMinute(post: ApiPost): MusicMinute {
  return {
    id: String(post.id),
    userId: String(post.userId),
    title: post.title,
    caption: post.caption ?? "",
    performanceType: (post.performanceType as MusicMinute["performanceType"]) ?? "original",
    genre: post.genre ?? "Pop",
    language: post.language ?? "English",
    location: "",
    tags: [],
    musixmatchTrackId: post.musixmatchTrackId ?? undefined,
    trackTitle: post.trackTitle ?? undefined,
    trackArtist: post.trackArtist ?? undefined,
    imageIndex: post.id % 3,
    videoUri: post.videoUrl,
    views: 0,
    likesCount: post.likesCount,
    commentsCount: post.commentsCount,
    sharesCount: 0,
    savesCount: post.savesCount,
    goldenMicsCount: post.goldenMicCount,
    createdAt: post.createdAt,
    isRisingVoice: false,
    isFeatured: false,
    creatorDisplayName: post.creator.displayName,
    creatorUsername: post.creator.username,
    creatorAvatarUrl: post.creator.avatarUrl,
  };
}

function apiCommentToSeed(c: { id: number; body: string; createdAt: string; creator: { id: number; username: string; displayName: string; avatarUrl: string | null } }, postId: string): SeedComment {
  return {
    id: String(c.id),
    userId: String(c.creator.id),
    username: c.creator.username,
    displayName: c.creator.displayName,
    avatarColor: avatarColorForUsername(c.creator.username),
    content: c.body,
    musicMinuteId: postId,
    createdAt: c.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { getToken, isSignedIn, isLoaded: authLoaded } = useAuth();
  const { user: clerkUser } = useUser();

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [apiFeed, setApiFeed] = useState<MusicMinute[] | null>(null);
  const [feedLoading, setFeedLoading] = useState(false);
  const [followingFeedState, setFollowingFeedState] = useState<MusicMinute[]>([]);
  const [followingLoading, setFollowingLoading] = useState(false);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [goldenMicsSent, setGoldenMicsSent] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, SeedComment[]>>({});
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);

  // Seed comments index (unchanged for guest mode)
  const seedComments = useMemo<Record<string, SeedComment[]>>(() => {
    const idx: Record<string, SeedComment[]> = {};
    for (const c of SEED_COMMENTS) {
      if (!idx[c.musicMinuteId]) idx[c.musicMinuteId] = [];
      idx[c.musicMinuteId].push(c);
    }
    return idx;
  }, []);

  // Merge API comments on top of seed comments
  const allComments = useMemo<Record<string, SeedComment[]>>(() => {
    const merged: Record<string, SeedComment[]> = { ...seedComments };
    for (const [k, v] of Object.entries(comments)) {
      merged[k] = [...v, ...(seedComments[k] ?? [])];
    }
    return merged;
  }, [comments, seedComments]);

  // Feed items exposed to consumers.
  // Signed-in users always see API data (empty list if bootstrap failed), never seed data.
  const musicMinutes = useMemo<MusicMinute[]>(() => {
    if (isSignedIn) {
      return apiFeed ?? [];
    }
    return SEED_MUSIC_MINUTES;
  }, [isSignedIn, apiFeed]);

  // Derived list of API-backed users the viewer is currently following (for share-sheet etc.)
  const followedApiUsers = useMemo<FollowedApiUser[]>(() => {
    if (!apiFeed) return [];
    const seen = new Set<string>();
    const result: FollowedApiUser[] = [];
    for (const mm of apiFeed) {
      const id = mm.userId;
      if (followingIds.has(id) && !seen.has(id)) {
        seen.add(id);
        const dbId = parseInt(id, 10);
        if (!isNaN(dbId)) {
          result.push({
            dbId,
            username: mm.creatorUsername ?? "",
            displayName: mm.creatorDisplayName ?? "",
            avatarUrl: mm.creatorAvatarUrl ?? null,
          });
        }
      }
    }
    return result;
  }, [apiFeed, followingIds]);

  // ------------------------------------------------------------------
  // Internal helpers
  // ------------------------------------------------------------------

  const fetchFeedInternal = useCallback(async (token: string) => {
    setFeedLoading(true);
    try {
      const result = await getPosts(token);
      const mapped = result.items.map(apiPostToMusicMinute);
      setApiFeed(mapped);

      const newLiked = new Set<string>();
      const newSaved = new Set<string>();
      const newFollowing = new Set<string>();
      for (const post of result.items) {
        if (post.viewerHasLiked) newLiked.add(String(post.id));
        if (post.viewerHasSaved) newSaved.add(String(post.id));
        if (post.viewerIsFollowing) newFollowing.add(String(post.userId));
      }
      setLikedIds(newLiked);
      setSavedIds(newSaved);
      setFollowingIds(newFollowing);
    } catch {
    } finally {
      setFeedLoading(false);
    }
  }, []);

  const fetchUnreadCounts = useCallback(async (token: string) => {
    try {
      const counts = await getUnreadCounts(token);
      setUnreadMessages(counts.messages);
      setUnreadNotifications(counts.notifications);
    } catch {}
  }, []);

  // ------------------------------------------------------------------
  // Auth side-effect: load user from API whenever sign-in state changes
  // ------------------------------------------------------------------

  const prevSignedInRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!authLoaded) return;

    const signedIn = isSignedIn ?? false;

    if (prevSignedInRef.current === signedIn) return;
    prevSignedInRef.current = signedIn;

    if (!signedIn) {
      setCurrentUser(null);
      setApiFeed(null);
      setLikedIds(new Set());
      setSavedIds(new Set());
      setFollowingIds(new Set());
      setGoldenMicsSent({});
      setIsLoaded(true);
      return;
    }

    (async () => {
      try {
        const token = await getToken();
        if (!token) return;

        // POST /auth/me upserts the user record on first sign-in; also works for returning users
        const apiUser = await upsertMe(token, {});
        const email = clerkUser?.primaryEmailAddress?.emailAddress ?? "";
        setCurrentUser({
          id: clerkUser?.id ?? apiUser.clerkId,
          dbId: apiUser.id,
          username: apiUser.username,
          displayName: apiUser.displayName,
          email,
          bio: apiUser.bio ?? "",
          goldenMicBalance: apiUser.goldenMicBalance,
          genres: apiUser.genres ?? [],
          isGuest: false,
          avatarUrl: apiUser.avatarUrl,
          followerCount: apiUser.followerCount,
          followingCount: apiUser.followingCount,
          postCount: apiUser.postCount,
        });

        await Promise.all([
          fetchFeedInternal(token),
          fetchUnreadCounts(token),
        ]);
      } catch {
      } finally {
        setIsLoaded(true);
      }
    })();
  }, [authLoaded, isSignedIn, clerkUser?.id]);

  // ------------------------------------------------------------------
  // Exposed actions
  // ------------------------------------------------------------------

  const login = useCallback(async (data: LoginData) => {
    const token = await getToken();
    if (!token) return;
    try {
      const apiUser = await upsertMe(token, {
        username: data.username,
        displayName: data.displayName,
      });
      if (data.genres && data.genres.length > 0) {
        await patchMe(token, { genres: data.genres });
      }
      const email = clerkUser?.primaryEmailAddress?.emailAddress ?? "";
      setCurrentUser({
        id: clerkUser?.id ?? apiUser.clerkId,
        dbId: apiUser.id,
        username: data.username ?? apiUser.username,
        displayName: data.displayName ?? apiUser.displayName,
        email,
        bio: data.bio ?? apiUser.bio ?? "",
        goldenMicBalance: apiUser.goldenMicBalance,
        genres: data.genres ?? apiUser.genres ?? [],
        isGuest: false,
        avatarUrl: apiUser.avatarUrl,
        followerCount: apiUser.followerCount,
        followingCount: apiUser.followingCount,
        postCount: apiUser.postCount,
      });
      await fetchFeedInternal(token);
    } catch {}
  }, [getToken, clerkUser?.id]);

  const logout = useCallback(() => {
    setCurrentUser(null);
    setApiFeed(null);
    setLikedIds(new Set());
    setSavedIds(new Set());
    setFollowingIds(new Set());
    setGoldenMicsSent({});
  }, []);

  const signUp = useCallback(async (_data: { username: string; displayName: string; email: string; genres: string[] }) => {
  }, []);

  const refreshFeed = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    await fetchFeedInternal(token);
  }, [getToken, fetchFeedInternal]);

  const fetchFollowingFeed = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    setFollowingLoading(true);
    try {
      const result = await getPosts(token, { feed: "following" });
      setFollowingFeedState(result.items.map(apiPostToMusicMinute));
    } catch {}
    setFollowingLoading(false);
  }, [getToken]);

  const toggleLike = useCallback(
    (musicMinuteId: string) => {
      setLikedIds((prev) => {
        const next = new Set(prev);
        const wasLiked = next.has(musicMinuteId);
        if (wasLiked) next.delete(musicMinuteId);
        else next.add(musicMinuteId);

        // Update local feed counts optimistically
        setApiFeed((feed) =>
          feed
            ? feed.map((mm) =>
                mm.id === musicMinuteId
                  ? { ...mm, likesCount: mm.likesCount + (wasLiked ? -1 : 1) }
                  : mm,
              )
            : feed,
        );

        // Call API (fire-and-forget with silent rollback on error)
        const postId = parseInt(musicMinuteId, 10);
        if (!isNaN(postId)) {
          getToken().then((token) => {
            if (!token) return;
            const fn = wasLiked ? unlikePost : likePost;
            fn(token, postId).catch(() => {
              // Revert likedIds
              setLikedIds((s) => {
                const rollback = new Set(s);
                if (wasLiked) rollback.add(musicMinuteId);
                else rollback.delete(musicMinuteId);
                return rollback;
              });
              // Revert feed likesCount
              setApiFeed((feed) =>
                feed
                  ? feed.map((mm) =>
                      mm.id === musicMinuteId
                        ? { ...mm, likesCount: mm.likesCount + (wasLiked ? 1 : -1) }
                        : mm,
                    )
                  : feed,
              );
            });
          });
        }

        return next;
      });
    },
    [getToken],
  );

  const toggleFollow = useCallback(
    (userId: string) => {
      setFollowingIds((prev) => {
        const next = new Set(prev);
        const wasFollowing = next.has(userId);
        if (wasFollowing) next.delete(userId);
        else next.add(userId);

        // Optimistically update current user's followingCount
        setCurrentUser((u) =>
          u ? { ...u, followingCount: u.followingCount + (wasFollowing ? -1 : 1) } : u,
        );

        const dbUserId = parseInt(userId, 10);
        if (!isNaN(dbUserId)) {
          getToken().then((token) => {
            if (!token) return;
            const fn = wasFollowing ? unfollowUser : followUser;
            fn(token, dbUserId).catch(() => {
              // Revert followingIds
              setFollowingIds((s) => {
                const rollback = new Set(s);
                if (wasFollowing) rollback.add(userId);
                else rollback.delete(userId);
                return rollback;
              });
              // Revert current user's followingCount
              setCurrentUser((u) =>
                u ? { ...u, followingCount: u.followingCount + (wasFollowing ? 1 : -1) } : u,
              );
            });
          });
        }

        return next;
      });
    },
    [getToken],
  );

  const toggleSave = useCallback(
    (musicMinuteId: string) => {
      setSavedIds((prev) => {
        const next = new Set(prev);
        const wasSaved = next.has(musicMinuteId);
        if (wasSaved) next.delete(musicMinuteId);
        else next.add(musicMinuteId);

        const postId = parseInt(musicMinuteId, 10);
        if (!isNaN(postId)) {
          getToken().then((token) => {
            if (!token) return;
            const fn = wasSaved ? unsavePost : savePost;
            fn(token, postId).catch(() => {
              setSavedIds((s) => {
                const rollback = new Set(s);
                if (wasSaved) rollback.add(musicMinuteId);
                else rollback.delete(musicMinuteId);
                return rollback;
              });
            });
          });
        }

        return next;
      });
    },
    [getToken],
  );

  const sendGoldenMic = useCallback(
    (musicMinuteId: string): boolean => {
      if (!currentUser) return false;
      if ((currentUser.goldenMicBalance ?? 0) <= 0) return false;

      const postId = parseInt(musicMinuteId, 10);

      setCurrentUser((u) => u ? { ...u, goldenMicBalance: u.goldenMicBalance - 1 } : u);
      setGoldenMicsSent((prev) => ({ ...prev, [musicMinuteId]: (prev[musicMinuteId] ?? 0) + 1 }));
      setApiFeed((feed) =>
        feed
          ? feed.map((mm) =>
              mm.id === musicMinuteId ? { ...mm, goldenMicsCount: mm.goldenMicsCount + 1 } : mm,
            )
          : feed,
      );

      if (!isNaN(postId)) {
        getToken().then((token) => {
          if (!token) return;
          sendGoldenMicApi(token, postId, 1).catch(() => {
            // Revert balance and sent count
            setCurrentUser((u) => u ? { ...u, goldenMicBalance: u.goldenMicBalance + 1 } : u);
            setGoldenMicsSent((prev) => ({ ...prev, [musicMinuteId]: Math.max(0, (prev[musicMinuteId] ?? 1) - 1) }));
            // Revert feed goldenMicsCount
            setApiFeed((feed) =>
              feed
                ? feed.map((mm) =>
                    mm.id === musicMinuteId ? { ...mm, goldenMicsCount: mm.goldenMicsCount - 1 } : mm,
                  )
                : feed,
            );
          });
        });
      }

      return true;
    },
    [currentUser, getToken],
  );

  const addGoldenMics = useCallback(
    (quantity: number) => {
      setCurrentUser((u) => u ? { ...u, goldenMicBalance: u.goldenMicBalance + quantity } : u);
    },
    [],
  );

  const updateAvatar = useCallback(
    (avatarUrl: string) => {
      setCurrentUser((u) => (u ? { ...u, avatarUrl } : u));
      getToken().then((token) => {
        if (!token) return;
        patchMe(token, { avatarUrl }).catch(() => {});
      });
    },
    [getToken],
  );

  const addComment = useCallback(
    (musicMinuteId: string, content: string) => {
      if (!currentUser) return;

      const optimistic: SeedComment = {
        id: "opt_" + Date.now().toString(36),
        userId: String(currentUser.dbId),
        username: currentUser.username,
        displayName: currentUser.displayName,
        avatarColor: "#A855F7",
        content,
        musicMinuteId,
        createdAt: new Date().toISOString(),
      };

      setComments((prev) => ({
        ...prev,
        [musicMinuteId]: [optimistic, ...(prev[musicMinuteId] ?? [])],
      }));

      setApiFeed((feed) =>
        feed
          ? feed.map((mm) =>
              mm.id === musicMinuteId ? { ...mm, commentsCount: mm.commentsCount + 1 } : mm,
            )
          : feed,
      );

      const postId = parseInt(musicMinuteId, 10);
      if (!isNaN(postId)) {
        getToken().then((token) => {
          if (!token) return;
          apiPostComment(token, postId, content).then((created) => {
            const real = apiCommentToSeed(created, musicMinuteId);
            setComments((prev) => ({
              ...prev,
              [musicMinuteId]: [
                real,
                ...(prev[musicMinuteId] ?? []).filter((c) => c.id !== optimistic.id),
              ],
            }));
          }).catch(() => {
            setComments((prev) => ({
              ...prev,
              [musicMinuteId]: (prev[musicMinuteId] ?? []).filter((c) => c.id !== optimistic.id),
            }));
          });
        });
      }
    },
    [currentUser, getToken],
  );

  const loadComments = useCallback(
    async (musicMinuteId: string) => {
      const postId = parseInt(musicMinuteId, 10);
      if (isNaN(postId)) return;

      const token = await getToken();
      if (!token) return;

      try {
        const result = await apiGetComments(token, postId);
        const mapped = result.items.map((c) => apiCommentToSeed(c, musicMinuteId));
        setComments((prev) => ({
          ...prev,
          [musicMinuteId]: mapped,
        }));
      } catch {}
    },
    [getToken],
  );

  const postMusicMinute = useCallback(
    (_mmData: Omit<MusicMinute, "id" | "views" | "likesCount" | "commentsCount" | "sharesCount" | "savesCount" | "goldenMicsCount" | "createdAt" | "isRisingVoice" | "isFeatured">) => {
      // The actual post was already saved via createPost() in post.tsx.
      // Refresh the feed to pick it up.
      getToken().then((token) => {
        if (!token) return;
        fetchFeedInternal(token);
      });
    },
    [getToken, fetchFeedInternal],
  );

  const sendDirectShare = useCallback(
    (recipientId: string, musicMinuteId: string, musicMinuteTitle: string, message: string): boolean => {
      if (!currentUser) return false;

      // Try API share via conversations (for DB user IDs)
      const dbRecipientId = parseInt(recipientId, 10);
      if (!isNaN(dbRecipientId)) {
        getToken().then(async (token) => {
          if (!token) return;
          try {
            const { id: convId } = await createOrGetConversation(token, dbRecipientId);
            await apiSendMessage(token, convId, {
              type: "music_minute_share",
              musicMinuteId,
            });
          } catch {}
        });
      }

      return true;
    },
    [currentUser, getToken],
  );

  const getInboxShares = useCallback((_userId: string): DirectShare[] => [], []);

  const markShareSeen = useCallback((_shareId: string) => {}, []);

  return (
    <AppContext.Provider
      value={{
        currentUser,
        musicMinutes,
        feedLoading,
        followingFeed: followingFeedState,
        followingLoading,
        followedApiUsers,
        users: SEED_USERS,
        likedIds,
        followingIds,
        savedIds,
        goldenMicsSent,
        comments: allComments,
        directShares: [],
        unreadMessages,
        unreadNotifications,
        isLoaded,
        login,
        logout,
        signUp,
        updateAvatar,
        toggleLike,
        toggleFollow,
        toggleSave,
        sendGoldenMic,
        addGoldenMics,
        addComment,
        loadComments,
        postMusicMinute,
        sendDirectShare,
        getInboxShares,
        markShareSeen,
        refreshFeed,
        fetchFollowingFeed,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
