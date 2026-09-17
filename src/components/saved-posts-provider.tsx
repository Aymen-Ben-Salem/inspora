"use client";

import { useAuth } from "@clerk/nextjs";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const STATUS_BATCH_SIZE = 100;

type SavedPostsContextValue = {
  ensureStatus: (postId: string) => void;
  isPending: (postId: string) => boolean;
  primeSaved: (postIds: string[]) => void;
  status: (postId: string) => boolean | undefined;
  toggle: (postId: string, current: boolean) => Promise<boolean>;
};

type SavedPostsState = {
  userId: string | null;
  statuses: Record<string, boolean>;
};

const SavedPostsContext = createContext<SavedPostsContextValue | null>(null);

function signInDestination() {
  const current = `${window.location.pathname}${window.location.search}`;
  return `/sign-in?redirect_url=${encodeURIComponent(current)}`;
}

async function fetchSavedStatuses(ids: string[], signal: AbortSignal) {
  const savedIds = new Set<string>();

  for (let offset = 0; offset < ids.length; offset += STATUS_BATCH_SIZE) {
    const batch = ids.slice(offset, offset + STATUS_BATCH_SIZE);
    const searchParams = new URLSearchParams();
    batch.forEach((id) => searchParams.append("id", id));
    const response = await fetch(`/api/saved-posts?${searchParams}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal,
    });
    const payload: unknown = await response.json();
    if (
      !response.ok ||
      !payload ||
      typeof payload !== "object" ||
      !Array.isArray((payload as { savedPostIds?: unknown }).savedPostIds)
    ) {
      throw new Error("Saved-post status request failed.");
    }
    (payload as { savedPostIds: unknown[] }).savedPostIds.forEach((id) => {
      if (typeof id === "string") savedIds.add(id);
    });
  }

  return savedIds;
}

export function SavedPostsProvider({ children }: PropsWithChildren) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const router = useRouter();
  const [state, setState] = useState<SavedPostsState>({
    userId: userId ?? null,
    statuses: {},
  });
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const queuedIdsRef = useRef(new Set<string>());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const stateRef = useRef(state);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 4500);
    return () => clearTimeout(timer);
  }, [error]);

  useEffect(
    () => () => {
      requestRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const replaceState = useCallback((nextState: SavedPostsState) => {
    stateRef.current = nextState;
    setState(nextState);
  }, []);

  const updateStatus = useCallback(
    (postId: string, saved: boolean, targetUserId = userId ?? null) => {
      const current = stateRef.current;
      replaceState(
        current.userId !== targetUserId
          ? { userId: targetUserId, statuses: { [postId]: saved } }
          : {
              ...current,
              statuses: { ...current.statuses, [postId]: saved },
            },
      );
    },
    [replaceState, userId],
  );

  const flushStatusQueue = useCallback(async () => {
    timerRef.current = null;
    if (!isLoaded || !isSignedIn || !userId) return;

    const ids = Array.from(queuedIdsRef.current);
    queuedIdsRef.current.clear();
    if (ids.length === 0) return;

    const controller = new AbortController();
    requestRef.current = controller;

    try {
      const savedIds = await fetchSavedStatuses(ids, controller.signal);
      if (stateRef.current.userId !== userId) return;
      const statuses = { ...stateRef.current.statuses };
      ids.forEach((id) => {
        // A toggle or saved-page hydration may have completed during this request.
        if (statuses[id] === undefined) statuses[id] = savedIds.has(id);
      });
      replaceState({ userId, statuses });
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setError("We couldn't load your saved-post status. You can still try again.");
      }
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }, [isLoaded, isSignedIn, replaceState, userId]);

  const ensureStatus = useCallback(
    (postId: string) => {
      if (!isLoaded || !isSignedIn || !userId) return;
      if (stateRef.current.userId !== userId) {
        requestRef.current?.abort();
        requestRef.current = null;
        queuedIdsRef.current.clear();
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
        replaceState({ userId, statuses: {} });
        setPendingIds(new Set());
        setError(null);
      }
      if (postId in stateRef.current.statuses) return;
      queuedIdsRef.current.add(postId);
      if (!timerRef.current) {
        timerRef.current = setTimeout(() => void flushStatusQueue(), 0);
      }
    },
    [flushStatusQueue, isLoaded, isSignedIn, replaceState, userId],
  );

  const primeSaved = useCallback(
    (postIds: string[]) => {
      if (!userId || postIds.length === 0) return;
      const statuses =
        stateRef.current.userId === userId
          ? { ...stateRef.current.statuses }
          : {};
      postIds.forEach((postId) => {
        if (statuses[postId] === undefined) statuses[postId] = true;
        queuedIdsRef.current.delete(postId);
      });
      replaceState({ userId, statuses });
    },
    [replaceState, userId],
  );

  const toggle = useCallback(
    async (postId: string, current: boolean) => {
      if (!isLoaded || !isSignedIn || !userId) {
        router.push(signInDestination() as Route);
        return current;
      }

      const next = !current;
      updateStatus(postId, next, userId);
      setPendingIds((pending) => new Set(pending).add(postId));

      try {
        const response = await fetch(`/api/saved-posts/${postId}`, {
          method: next ? "POST" : "DELETE",
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error("Saved-post update failed.");
        return next;
      } catch {
        updateStatus(postId, current, userId);
        setError(
          next
            ? "We couldn't save this post. Your previous state was restored."
            : "We couldn't remove this post. Your previous state was restored.",
        );
        return current;
      } finally {
        setPendingIds((pending) => {
          const nextPending = new Set(pending);
          nextPending.delete(postId);
          return nextPending;
        });
      }
    },
    [isLoaded, isSignedIn, router, updateStatus, userId],
  );

  const value = useMemo<SavedPostsContextValue>(
    () => ({
      ensureStatus,
      isPending: (postId) => pendingIds.has(postId),
      primeSaved,
      status: (postId) =>
        state.userId === (userId ?? null) ? state.statuses[postId] : undefined,
      toggle,
    }),
    [ensureStatus, pendingIds, primeSaved, state, toggle, userId],
  );

  return (
    <SavedPostsContext.Provider value={value}>
      {children}
      {error ? (
        <div
          role="alert"
          className="fixed bottom-5 left-1/2 z-[100] max-w-[calc(100vw-32px)] -translate-x-1/2 bg-[#262626] px-4 py-3 text-center text-sm text-white shadow-lg"
        >
          {error}
        </div>
      ) : null}
    </SavedPostsContext.Provider>
  );
}

export function useSavedPosts() {
  const context = useContext(SavedPostsContext);
  return (
    context ?? {
      ensureStatus: () => undefined,
      isPending: () => false,
      primeSaved: () => undefined,
      status: () => undefined,
      toggle: async (_postId: string, current: boolean) => {
        window.location.assign(signInDestination());
        return current;
      },
    }
  );
}
