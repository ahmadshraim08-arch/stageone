import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
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

interface CurrentUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
  bio: string;
  goldenMicBalance: number;
  genres: string[];
  isGuest: boolean;
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

interface AppContextType {
  currentUser: CurrentUser | null;
  musicMinutes: MusicMinute[];
  users: User[];
  likedIds: Set<string>;
  followingIds: Set<string>;
  savedIds: Set<string>;
  goldenMicsSent: Record<string, number>;
  comments: Record<string, SeedComment[]>;
  directShares: DirectShare[];
  isLoaded: boolean;

  login: (user: CurrentUser) => Promise<void>;
  logout: () => Promise<void>;
  signUp: (data: {
    username: string;
    displayName: string;
    email: string;
    genres: string[];
  }) => Promise<void>;
  toggleLike: (musicMinuteId: string) => void;
  toggleFollow: (userId: string) => void;
  toggleSave: (musicMinuteId: string) => void;
  sendGoldenMic: (musicMinuteId: string) => boolean;
  addGoldenMics: (quantity: number) => void;
  addComment: (musicMinuteId: string, content: string) => void;
  postMusicMinute: (mm: Omit<MusicMinute, "id" | "views" | "likesCount" | "commentsCount" | "sharesCount" | "savesCount" | "goldenMicsCount" | "createdAt" | "isRisingVoice" | "isFeatured">) => void;
  sendDirectShare: (recipientId: string, musicMinuteId: string, musicMinuteTitle: string, message: string) => boolean;
  getInboxShares: (userId: string) => DirectShare[];
  markShareSeen: (shareId: string) => void;
}

const AppContext = createContext<AppContextType | null>(null);

const STORAGE_KEYS = {
  currentUser: "stageone_current_user",
  likedIds: "stageone_liked_ids",
  followingIds: "stageone_following_ids",
  savedIds: "stageone_saved_ids",
  goldenMicsSent: "stageone_golden_mics_sent",
  musicMinutesExtra: "stageone_music_minutes_extra",
  commentsExtra: "stageone_comments_extra",
  directShares: "stageone_direct_shares",
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [goldenMicsSent, setGoldenMicsSent] = useState<Record<string, number>>({});
  const [extraMusicMinutes, setExtraMusicMinutes] = useState<MusicMinute[]>([]);
  const [extraComments, setExtraComments] = useState<Record<string, SeedComment[]>>({});
  const [directShares, setDirectShares] = useState<DirectShare[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    loadState();
  }, []);

  async function loadState() {
    try {
      const [userStr, likedStr, followingStr, savedStr, gmStr, mmStr, cStr, dsStr] =
        await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.currentUser),
          AsyncStorage.getItem(STORAGE_KEYS.likedIds),
          AsyncStorage.getItem(STORAGE_KEYS.followingIds),
          AsyncStorage.getItem(STORAGE_KEYS.savedIds),
          AsyncStorage.getItem(STORAGE_KEYS.goldenMicsSent),
          AsyncStorage.getItem(STORAGE_KEYS.musicMinutesExtra),
          AsyncStorage.getItem(STORAGE_KEYS.commentsExtra),
          AsyncStorage.getItem(STORAGE_KEYS.directShares),
        ]);

      if (userStr) setCurrentUser(JSON.parse(userStr));
      if (likedStr) setLikedIds(new Set(JSON.parse(likedStr)));
      if (followingStr) setFollowingIds(new Set(JSON.parse(followingStr)));
      if (savedStr) setSavedIds(new Set(JSON.parse(savedStr)));
      if (gmStr) setGoldenMicsSent(JSON.parse(gmStr));
      if (mmStr) setExtraMusicMinutes(JSON.parse(mmStr));
      if (cStr) setExtraComments(JSON.parse(cStr));
      if (dsStr) setDirectShares(JSON.parse(dsStr));
    } catch {
    } finally {
      setIsLoaded(true);
    }
  }

  const login = useCallback(async (user: CurrentUser) => {
    setCurrentUser(user);
    await AsyncStorage.setItem(STORAGE_KEYS.currentUser, JSON.stringify(user));
  }, []);

  const logout = useCallback(async () => {
    setCurrentUser(null);
    await AsyncStorage.removeItem(STORAGE_KEYS.currentUser);
  }, []);

  const signUp = useCallback(
    async (data: {
      username: string;
      displayName: string;
      email: string;
      genres: string[];
    }) => {
      const user: CurrentUser = {
        id: "user_" + Date.now().toString(36),
        username: data.username,
        displayName: data.displayName,
        email: data.email,
        bio: "",
        goldenMicBalance: 1,
        genres: data.genres,
        isGuest: false,
      };
      await login(user);
    },
    [login]
  );

  const toggleLike = useCallback(
    (musicMinuteId: string) => {
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (next.has(musicMinuteId)) {
          next.delete(musicMinuteId);
        } else {
          next.add(musicMinuteId);
        }
        AsyncStorage.setItem(STORAGE_KEYS.likedIds, JSON.stringify([...next]));
        return next;
      });
    },
    []
  );

  const toggleFollow = useCallback((userId: string) => {
    setFollowingIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      AsyncStorage.setItem(STORAGE_KEYS.followingIds, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const toggleSave = useCallback((musicMinuteId: string) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(musicMinuteId)) {
        next.delete(musicMinuteId);
      } else {
        next.add(musicMinuteId);
      }
      AsyncStorage.setItem(STORAGE_KEYS.savedIds, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const sendGoldenMic = useCallback(
    (musicMinuteId: string): boolean => {
      if (!currentUser) return false;
      if (currentUser.goldenMicBalance <= 0) return false;

      const updated = {
        ...currentUser,
        goldenMicBalance: currentUser.goldenMicBalance - 1,
      };
      setCurrentUser(updated);
      AsyncStorage.setItem(STORAGE_KEYS.currentUser, JSON.stringify(updated));

      setGoldenMicsSent((prev) => {
        const next = {
          ...prev,
          [musicMinuteId]: (prev[musicMinuteId] ?? 0) + 1,
        };
        AsyncStorage.setItem(STORAGE_KEYS.goldenMicsSent, JSON.stringify(next));
        return next;
      });

      return true;
    },
    [currentUser]
  );

  const addGoldenMics = useCallback(
    (quantity: number) => {
      if (!currentUser) return;
      const updated = {
        ...currentUser,
        goldenMicBalance: currentUser.goldenMicBalance + quantity,
      };
      setCurrentUser(updated);
      AsyncStorage.setItem(STORAGE_KEYS.currentUser, JSON.stringify(updated));
    },
    [currentUser]
  );

  const addComment = useCallback(
    (musicMinuteId: string, content: string) => {
      if (!currentUser) return;
      const newComment: SeedComment = {
        id: "c_" + Date.now().toString(36),
        userId: currentUser.id,
        username: currentUser.username,
        displayName: currentUser.displayName,
        avatarColor: "#A855F7",
        content,
        musicMinuteId,
        createdAt: new Date().toISOString(),
      };
      setExtraComments((prev) => {
        const next = {
          ...prev,
          [musicMinuteId]: [newComment, ...(prev[musicMinuteId] ?? [])],
        };
        AsyncStorage.setItem(STORAGE_KEYS.commentsExtra, JSON.stringify(next));
        return next;
      });
    },
    [currentUser]
  );

  const postMusicMinute = useCallback(
    (mmData: Omit<MusicMinute, "id" | "views" | "likesCount" | "commentsCount" | "sharesCount" | "savesCount" | "goldenMicsCount" | "createdAt" | "isRisingVoice" | "isFeatured">) => {
      const mm: MusicMinute = {
        ...mmData,
        id: "mm_" + Date.now().toString(36),
        views: 0,
        likesCount: 0,
        commentsCount: 0,
        sharesCount: 0,
        savesCount: 0,
        goldenMicsCount: 0,
        createdAt: new Date().toISOString(),
        isRisingVoice: false,
        isFeatured: false,
      };
      setExtraMusicMinutes((prev) => {
        const next = [mm, ...prev];
        AsyncStorage.setItem(STORAGE_KEYS.musicMinutesExtra, JSON.stringify(next));
        return next;
      });
    },
    []
  );

  const sendDirectShare = useCallback(
    (recipientId: string, musicMinuteId: string, musicMinuteTitle: string, message: string): boolean => {
      if (!currentUser) return false;
      const share: DirectShare = {
        id: "ds_" + Date.now().toString(36),
        senderId: currentUser.id,
        senderDisplayName: currentUser.displayName,
        senderUsername: currentUser.username,
        senderAvatarColor: "#A855F7",
        recipientId,
        musicMinuteId,
        musicMinuteTitle,
        message,
        createdAt: new Date().toISOString(),
        seenAt: null,
      };
      setDirectShares((prev) => {
        const next = [share, ...prev];
        AsyncStorage.setItem(STORAGE_KEYS.directShares, JSON.stringify(next));
        return next;
      });
      return true;
    },
    [currentUser]
  );

  const getInboxShares = useCallback(
    (userId: string): DirectShare[] => {
      return directShares.filter((s) => s.recipientId === userId);
    },
    [directShares]
  );

  const markShareSeen = useCallback((shareId: string) => {
    setDirectShares((prev) => {
      const next = prev.map((s) =>
        s.id === shareId ? { ...s, seenAt: new Date().toISOString() } : s
      );
      AsyncStorage.setItem(STORAGE_KEYS.directShares, JSON.stringify(next));
      return next;
    });
  }, []);

  const allMusicMinutes = [...extraMusicMinutes, ...SEED_MUSIC_MINUTES];

  const allComments: Record<string, SeedComment[]> = {};
  for (const c of SEED_COMMENTS) {
    if (!allComments[c.musicMinuteId]) allComments[c.musicMinuteId] = [];
    allComments[c.musicMinuteId].push(c);
  }
  for (const [mmId, cs] of Object.entries(extraComments)) {
    allComments[mmId] = [...cs, ...(allComments[mmId] ?? [])];
  }

  return (
    <AppContext.Provider
      value={{
        currentUser,
        musicMinutes: allMusicMinutes,
        users: SEED_USERS,
        likedIds,
        followingIds,
        savedIds,
        goldenMicsSent,
        comments: allComments,
        directShares,
        isLoaded,
        login,
        logout,
        signUp,
        toggleLike,
        toggleFollow,
        toggleSave,
        sendGoldenMic,
        addGoldenMics,
        addComment,
        postMusicMinute,
        sendDirectShare,
        getInboxShares,
        markShareSeen,
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
