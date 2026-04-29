import { useCallback, useEffect, useRef, useState } from "react";
import { cachedRequest, getCacheSnapshot, getCachedValue, setCachedValue } from "@/lib/requestCache";
import {
  CHAT_CACHE_TTL,
  fetchChatMessages,
  fetchChatPreviews,
  fetchChatThreadById,
  fetchChatThreadsForParticipant,
  getChatThreadsCacheKey,
  markChatMessagesRead,
  mergeChatThread,
  sanitizeChatThread,
  sanitizeChatThreads,
} from "@/lib/chatFlow";
import { isThreadHiddenForParticipant, type ChatMessage, type ChatParticipant, type ChatThread } from "@/lib/chat";

const THREAD_POLL_INTERVAL_MS = 15000;
const MESSAGE_POLL_INTERVAL_MS = 7000;
const PREVIEW_POLL_INTERVAL_MS = 15000;
const THREAD_FETCH_COOLDOWN_MS = 4000;
const MESSAGE_FETCH_COOLDOWN_MS = 2500;
const PREVIEW_FETCH_COOLDOWN_MS = 4000;
const THREAD_INITIAL_INTERVAL_DELAY_MS = 4000;
const MESSAGE_INITIAL_INTERVAL_DELAY_MS = 4000;
const PREVIEW_INITIAL_INTERVAL_DELAY_MS = 4000;

const getMessageTimestamp = (message: Pick<ChatMessage, "createdAt">) => {
  const timestamp = new Date(message.createdAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const isOptimisticMessage = (message: ChatMessage) => typeof message.id === "string" && message.id.startsWith("temp-");

const findMatchingOptimisticMessageId = (messages: ChatMessage[], incoming: ChatMessage) => {
  const incomingTimestamp = getMessageTimestamp(incoming);
  return messages.find((message) => {
    if (!isOptimisticMessage(message)) return false;
    if (message.threadId !== incoming.threadId) return false;
    if (message.senderId !== incoming.senderId) return false;
    if (message.text.trim() !== incoming.text.trim()) return false;
    return Math.abs(getMessageTimestamp(message) - incomingTimestamp) < 15_000;
  })?.id ?? null;
};

const areMessagesEqual = (a: ChatMessage, b: ChatMessage) => (
  a.id === b.id
  && a.threadId === b.threadId
  && a.senderId === b.senderId
  && a.text === b.text
  && a.createdAt === b.createdAt
  && (a.readAt ?? null) === (b.readAt ?? null)
);

const mergeMessages = (current: ChatMessage[], incoming: ChatMessage[]) => {
  if (incoming.length === 0) return current;

  const normalizedCurrent = [...current];
  incoming.forEach((message) => {
    if (!message?.id) return;
    const optimisticId = findMatchingOptimisticMessageId(normalizedCurrent, message);
    if (!optimisticId) return;
    const optimisticIndex = normalizedCurrent.findIndex((item) => item.id === optimisticId);
    if (optimisticIndex >= 0) normalizedCurrent.splice(optimisticIndex, 1);
  });

  const merged = new Map<string, ChatMessage>();
  [...normalizedCurrent, ...incoming].forEach((message) => {
    if (!message?.id) return;
    merged.set(message.id, message);
  });

  const next = Array.from(merged.values()).sort((a, b) => {
    const diff = getMessageTimestamp(a) - getMessageTimestamp(b);
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });

  if (next.length !== current.length) return next;

  for (let index = 0; index < next.length; index += 1) {
    if (!areMessagesEqual(next[index], current[index])) {
      return next;
    }
  }

  return current;
};

const mergePreviews = (
  current: Record<string, ChatMessage>,
  incoming: Record<string, ChatMessage>,
) => {
  const next = { ...current };
  Object.entries(incoming).forEach(([threadId, message]) => {
    const existing = next[threadId];
    if (!existing || getMessageTimestamp(existing) <= getMessageTimestamp(message)) {
      next[threadId] = message;
    }
  });
  return next;
};

export function useChatThreads(participant: ChatParticipant | null) {
  const cacheKey = participant ? getChatThreadsCacheKey(participant) : null;
  const cacheSnapshot = cacheKey ? getCacheSnapshot<ChatThread[]>(cacheKey) : null;
  const [threads, setThreads] = useState<ChatThread[]>(() => (
    participant && cacheSnapshot?.value ? sanitizeChatThreads(cacheSnapshot.value, participant) : []
  ));
  const [loading, setLoading] = useState(() => cacheKey ? !cacheSnapshot?.value : false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const lastFetchAtRef = useRef(0);
  const inFlightPromiseRef = useRef<Promise<void> | null>(null);
  const threadsRef = useRef<ChatThread[]>(participant && cacheSnapshot?.value ? sanitizeChatThreads(cacheSnapshot.value, participant) : []);

  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  const fetch = useCallback(async (opts?: { silent?: boolean; force?: boolean }) => {
    if (!participant) {
      setThreads([]);
      setLoading(false);
      return;
    }

    const now = Date.now();
    if (inFlightRef.current) return inFlightPromiseRef.current ?? Promise.resolve();
    if (now - lastFetchAtRef.current < THREAD_FETCH_COOLDOWN_MS) return;

    const request = (async () => {
      const key = getChatThreadsCacheKey(participant);
      if (!opts?.silent && threadsRef.current.length === 0) setLoading(true);
      inFlightRef.current = true;
      lastFetchAtRef.current = now;

      try {
        const next = opts?.force
          ? await fetchChatThreadsForParticipant(participant)
          : await cachedRequest(key, () => fetchChatThreadsForParticipant(participant), CHAT_CACHE_TTL);

        const safeNext = sanitizeChatThreads(next, participant);
        setThreads((current) => {
          const resolved = safeNext.length === 0 && current.length > 0 ? current : safeNext;
          if (resolved === current) return current;
          setCachedValue(key, resolved, CHAT_CACHE_TTL);
          return resolved;
        });
        if (!(safeNext.length === 0 && threads.length > 0)) {
          setCachedValue(key, safeNext, CHAT_CACHE_TTL);
        }
        setError(safeNext.length === 0 && threadsRef.current.length > 0 ? "Не удалось обновить чаты" : null);
      } finally {
        inFlightRef.current = false;
        inFlightPromiseRef.current = null;
        if (!opts?.silent) setLoading(false);
      }
    })();

    inFlightPromiseRef.current = request;
    return request;
  }, [participant?.profileId, participant?.kind]);

  useEffect(() => {
    if (!participant) {
      void fetch();
      return;
    }

    const key = getChatThreadsCacheKey(participant);
    const snapshot = getCacheSnapshot<ChatThread[]>(key);
    if (snapshot.value) {
      setThreads(sanitizeChatThreads(snapshot.value, participant));
      setLoading(false);
    } else {
      setThreads([]);
      setLoading(true);
    }

    if (!(snapshot.exists && !snapshot.isStale)) {
      if (snapshot.value) void fetch({ silent: true, force: true });
      else void fetch();
    }

    const timeoutId = window.setTimeout(() => {
      void fetch({ silent: true, force: true });
    }, THREAD_INITIAL_INTERVAL_DELAY_MS);

    const intervalId = window.setInterval(() => {
      void fetch({ silent: true, force: true });
    }, THREAD_POLL_INTERVAL_MS + THREAD_INITIAL_INTERVAL_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [fetch, participant?.profileId, participant?.kind]);

  const addThread = useCallback((thread: ChatThread) => {
    const safeThread = sanitizeChatThread(thread);
    if (!safeThread?.id || !participant || isThreadHiddenForParticipant(safeThread, participant)) return;
    setThreads((current) => {
      const next = mergeChatThread(current, safeThread);
      setCachedValue(getChatThreadsCacheKey(participant), next, CHAT_CACHE_TTL);
      return next;
    });
  }, [participant?.profileId, participant?.kind]);

  const removeThreadLocal = useCallback((threadId: string) => {
    setThreads((current) => {
      const next = current.filter((thread) => thread.id !== threadId);
      if (participant) setCachedValue(getChatThreadsCacheKey(participant), next, CHAT_CACHE_TTL);
      return next;
    });
  }, [participant?.profileId, participant?.kind]);

  const updateThreadLocal = useCallback((threadId: string, updates: Partial<ChatThread>) => {
    setThreads((current) => {
      const next = current.map((thread) => thread.id === threadId ? { ...thread, ...updates } : thread);
      if (participant) setCachedValue(getChatThreadsCacheKey(participant), next, CHAT_CACHE_TTL);
      return next;
    });
  }, [participant?.profileId, participant?.kind]);

  const refreshThread = useCallback(async (threadId: string) => {
    if (!participant || !threadId) return null;

    const safeThread = await fetchChatThreadById(threadId, participant);
    if (!safeThread) return null;

    setThreads((current) => {
      const next = mergeChatThread(current, safeThread);
      setCachedValue(getChatThreadsCacheKey(participant), next, CHAT_CACHE_TTL);
      return next;
    });

    return safeThread;
  }, [participant?.profileId, participant?.kind]);

  return { threads, loading, error, refetch: fetch, addThread, removeThreadLocal, updateThreadLocal, refreshThread };
}

export function useChatMessages(thread: ChatThread | null, participant: ChatParticipant | null, currentUserId?: string | null) {
  const cacheKey = thread?.id ? `chat-messages:${thread.id}` : null;
  const cacheSnapshot = cacheKey ? getCacheSnapshot<ChatMessage[]>(cacheKey) : null;
  const [messages, setMessages] = useState<ChatMessage[]>(() => cacheSnapshot?.value ?? []);
  const [loading, setLoading] = useState(() => !cacheSnapshot?.value && !!thread?.id);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const markingReadRef = useRef<Set<string>>(new Set());
  const inFlightRef = useRef(false);
  const lastFetchAtRef = useRef(0);
  const inFlightPromiseRef = useRef<Promise<void> | null>(null);
  const messagesRef = useRef<ChatMessage[]>(cacheSnapshot?.value ?? []);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const updateMessagesCache = useCallback((updater: (current: ChatMessage[]) => ChatMessage[]) => {
    if (!thread?.id) return;
    const key = `chat-messages:${thread.id}`;
    setCachedValue(key, updater(getCachedValue<ChatMessage[]>(key) ?? []), CHAT_CACHE_TTL);
  }, [thread?.id]);

  const patchMessages = useCallback((updater: (current: ChatMessage[]) => ChatMessage[]) => {
    setMessages((current) => {
      const next = updater(current);
      if (next === current) return current;
      updateMessagesCache(() => next);
      return next;
    });
  }, [updateMessagesCache]);

  const fetch = useCallback(async (opts?: { silent?: boolean; force?: boolean }) => {
    const currentRequestId = ++requestId.current;
    if (!thread?.id) {
      setMessages([]);
      setLoading(false);
      return;
    }

    const now = Date.now();
    if (inFlightRef.current) return inFlightPromiseRef.current ?? Promise.resolve();
    if (now - lastFetchAtRef.current < MESSAGE_FETCH_COOLDOWN_MS) return;

    const request = (async () => {
      const key = `chat-messages:${thread.id}`;
      if (!opts?.silent && messagesRef.current.length === 0) setLoading(true);
      inFlightRef.current = true;
      lastFetchAtRef.current = now;

      try {
        const next = opts?.force
          ? await fetchChatMessages(thread.id)
          : await cachedRequest(key, () => fetchChatMessages(thread.id), CHAT_CACHE_TTL);
        if (currentRequestId !== requestId.current) return;
        setMessages((current) => {
          const merged = next.length === 0 && current.length > 0 ? current : mergeMessages(current, next);
          setCachedValue(key, merged, CHAT_CACHE_TTL);
          return merged;
        });
        setError(next.length === 0 && messagesRef.current.length > 0 ? "Не удалось обновить сообщения" : null);
      } finally {
        inFlightRef.current = false;
        inFlightPromiseRef.current = null;
        if (!opts?.silent) setLoading(false);
      }
    })();

    inFlightPromiseRef.current = request;
    return request;
  }, [thread?.id]);

  useEffect(() => {
    if (!thread?.id) {
      setMessages([]);
      setLoading(false);
      return;
    }

    const key = `chat-messages:${thread.id}`;
    const snapshot = getCacheSnapshot<ChatMessage[]>(key);
    if (snapshot.value) {
      setMessages(snapshot.value);
      setLoading(false);
    } else {
      setMessages([]);
      setLoading(true);
    }

    if (!(snapshot.exists && !snapshot.isStale)) {
      if (snapshot.value) void fetch({ silent: true, force: true });
      else void fetch();
    }

    const timeoutId = window.setTimeout(() => {
      void fetch({ silent: true, force: true });
    }, MESSAGE_INITIAL_INTERVAL_DELAY_MS);

    const intervalId = window.setInterval(() => {
      void fetch({ silent: true, force: true });
    }, MESSAGE_POLL_INTERVAL_MS + MESSAGE_INITIAL_INTERVAL_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [fetch, thread?.id, participant?.profileId, participant?.kind]);

  useEffect(() => {
    if (!thread?.id || messages.length === 0) return;

    const selfIds = new Set([currentUserId, participant?.profileId].filter((value): value is string => Boolean(value)));
    const unreadIncomingIds = messages
      .filter((message) => !selfIds.has(message.senderId) && !message.readAt && !markingReadRef.current.has(message.id))
      .map((message) => message.id);

    if (unreadIncomingIds.length === 0) return;

    unreadIncomingIds.forEach((id) => markingReadRef.current.add(id));
    const readAt = new Date().toISOString();

    patchMessages((current) => current.map((message) => (
      unreadIncomingIds.includes(message.id) ? { ...message, readAt } : message
    )));

    void markChatMessagesRead(unreadIncomingIds, readAt).then(({ data, error }) => {
      unreadIncomingIds.forEach((id) => markingReadRef.current.delete(id));
      if (error) {
        console.error("Failed to mark chat messages as read", {
          error,
          activeThreadId: thread.id,
          currentUserId: currentUserId ?? null,
          participantProfileId: participant?.profileId ?? null,
          count: unreadIncomingIds.length,
          unreadIncomingIds,
        });
        void fetch({ silent: true, force: true });
        return;
      }

      if (data.length > 0) {
        patchMessages((current) => mergeMessages(current, data));
      }
    });
  }, [currentUserId, fetch, messages, participant?.profileId, patchMessages, thread?.id]);

  const appendMessage = useCallback((message: ChatMessage) => {
    setMessages((current) => {
      const next = mergeMessages(current, [message]);
      if (next === current) return current;
      updateMessagesCache((cached) => mergeMessages(cached, [message]));
      return next;
    });
  }, [updateMessagesCache]);

  const replaceMessage = useCallback((tempId: string, message: ChatMessage) => {
    setMessages((current) => {
      const next = mergeMessages(current.filter((item) => item.id !== tempId), [message]);
      if (next === current) return current;
      updateMessagesCache((cached) => mergeMessages(cached.filter((item) => item.id !== tempId), [message]));
      return next;
    });
  }, [updateMessagesCache]);

  const removeMessage = useCallback((messageId: string) => {
    setMessages((current) => {
      const next = current.filter((item) => item.id !== messageId);
      updateMessagesCache(() => next);
      return next;
    });
  }, [updateMessagesCache]);

  return { messages, loading, error, refetch: fetch, appendMessage, replaceMessage, removeMessage };
}

export function useChatThreadPreviews(threads: ChatThread[]) {
  const [previews, setPreviews] = useState<Record<string, ChatMessage>>({});
  const threadIds = threads.map((thread) => thread.id).join(",");
  const inFlightRef = useRef(false);
  const lastFetchAtRef = useRef(0);
  const inFlightPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    const ids = threads.map((thread) => thread.id).filter(Boolean);
    if (ids.length === 0) {
      setPreviews({});
      return;
    }

    let cancelled = false;
    const key = `chat-previews:${ids.join(",")}`;

    const fetchCurrent = async (force = false) => {
      const now = Date.now();
      if (inFlightRef.current) return inFlightPromiseRef.current ?? Promise.resolve();
      if (now - lastFetchAtRef.current < PREVIEW_FETCH_COOLDOWN_MS) return;

      const snapshot = getCacheSnapshot<Record<string, ChatMessage>>(key);
      if (!force) {
        if (snapshot.value) {
          setPreviews(snapshot.value);
        } else {
          setPreviews({});
        }
        if (snapshot.exists && !snapshot.isStale) return;
      }

      const request = (async () => {
        inFlightRef.current = true;
        lastFetchAtRef.current = now;

        try {
          const next = force
            ? await fetchChatPreviews(ids)
            : await cachedRequest(key, () => fetchChatPreviews(ids), 30_000);

          if (cancelled) return;

          setPreviews((current) => {
            const merged = mergePreviews(current, next);
            setCachedValue(key, merged, 30_000);
            return merged;
          });
        } finally {
          inFlightRef.current = false;
          inFlightPromiseRef.current = null;
        }
      })();

      inFlightPromiseRef.current = request;
      return request;
    };

    void fetchCurrent();
    const timeoutId = window.setTimeout(() => {
      void fetchCurrent(true);
    }, PREVIEW_INITIAL_INTERVAL_DELAY_MS);

    const intervalId = window.setInterval(() => {
      void fetchCurrent(true);
    }, PREVIEW_POLL_INTERVAL_MS + PREVIEW_INITIAL_INTERVAL_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [threadIds]);

  const updatePreview = useCallback((threadId: string, message: ChatMessage | null) => {
    setPreviews((current) => {
      if (message) return { ...current, [threadId]: message };

      const { [threadId]: _removed, ...rest } = current;
      return rest;
    });
  }, []);

  return { previews, updatePreview };
}
