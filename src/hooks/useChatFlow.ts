import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cachedRequest, getCacheSnapshot, getCachedValue, setCachedValue } from "@/lib/requestCache";
import {
  CHAT_CACHE_TTL,
  fetchChatMessages,
  fetchChatPreviews,
  fetchChatThreadsForParticipant,
  getChatThreadsCacheKey,
  mapReadyChatMessages,
  mapReadyChatThreads,
  mergeChatThread,
  sanitizeChatThread,
  sanitizeChatThreads,
} from "@/lib/chatFlow";
import { isThreadHiddenForParticipant, type ChatMessage, type ChatMessageRow, type ChatParticipant, type ChatThread, type ChatThreadRow } from "@/lib/chat";

const CHAT_THREAD_SELECT = "id,application_id,booking_id,gig_id,dj_id,venue_id,created_at,updated_at,hidden_by_dj,hidden_by_venue, bookings(status, completed_at), venue_posts(title, event_date, deadline, start_time, post_type), dj_profiles(name), venue_profiles(name)";

const getMessageTimestamp = (message: Pick<ChatMessage, "createdAt">) => {
  const timestamp = new Date(message.createdAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const mergeMessages = (current: ChatMessage[], incoming: ChatMessage[]) => {
  const merged = new Map<string, ChatMessage>();
  [...current, ...incoming].forEach((message) => {
    if (!message?.id) return;
    merged.set(message.id, message);
  });

  return Array.from(merged.values()).sort((a, b) => {
    const diff = getMessageTimestamp(a) - getMessageTimestamp(b);
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });
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

  const fetch = useCallback(async (opts?: { silent?: boolean; force?: boolean }) => {
    if (!participant) {
      setThreads([]);
      setLoading(false);
      return;
    }

    const key = getChatThreadsCacheKey(participant);
    if (!opts?.silent) setLoading(true);
    const next = opts?.force
      ? await fetchChatThreadsForParticipant(participant)
      : await cachedRequest(key, () => fetchChatThreadsForParticipant(participant), CHAT_CACHE_TTL);

    const safeNext = sanitizeChatThreads(next, participant);
    setCachedValue(key, safeNext, CHAT_CACHE_TTL);
    setThreads(safeNext);
    if (!opts?.silent) setLoading(false);
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

    if (snapshot.exists && !snapshot.isStale) {
      return;
    }

    if (snapshot.value) {
      void fetch({ silent: true, force: true });
    } else {
      void fetch();
    }

    const participantColumn = participant.kind === "dj" ? "dj_id" : "venue_id";
    const channel = supabase
      .channel(`chat-threads-${participant.kind}-${participant.profileId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_threads",
          filter: `${participantColumn}=eq.${participant.profileId}`,
        },
        () => { void fetch({ silent: true, force: true }); },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
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

    const { data, error } = await supabase
      .from("chat_threads")
      .select(CHAT_THREAD_SELECT)
      .eq("id", threadId)
      .maybeSingle();

    if (error) {
      console.error("Failed to refresh chat thread", { error, threadId, participant });
      return null;
    }

    const nextThread = mapReadyChatThreads((data ? [data as ChatThreadRow] : []) ?? [])[0] ?? null;
    const safeThread = sanitizeChatThread(nextThread);
    if (!safeThread || isThreadHiddenForParticipant(safeThread, participant)) return null;

    setThreads((current) => {
      const next = mergeChatThread(current, safeThread);
      setCachedValue(getChatThreadsCacheKey(participant), next, CHAT_CACHE_TTL);
      return next;
    });

    return safeThread;
  }, [participant?.profileId, participant?.kind]);

  return { threads, loading, refetch: fetch, addThread, removeThreadLocal, updateThreadLocal, refreshThread };
}

export function useChatMessages(thread: ChatThread | null, participant: ChatParticipant | null, currentUserId?: string | null) {
  const cacheKey = thread?.id ? `chat-messages:${thread.id}` : null;
  const cacheSnapshot = cacheKey ? getCacheSnapshot<ChatMessage[]>(cacheKey) : null;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(() => !cacheSnapshot?.value && !!thread?.id);
  const requestId = useRef(0);
  const activeThreadIdRef = useRef<string | null>(thread?.id ?? null);
  const markingReadRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    activeThreadIdRef.current = thread?.id ?? null;
  }, [thread?.id]);

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

    const key = `chat-messages:${thread.id}`;
    if (!opts?.silent) setLoading(true);
    const next = opts?.force
      ? await fetchChatMessages(thread.id)
      : await cachedRequest(key, () => fetchChatMessages(thread.id), CHAT_CACHE_TTL);
    if (currentRequestId !== requestId.current) return;
    setMessages((current) => {
      const merged = mergeMessages(current, next);
      setCachedValue(key, merged, CHAT_CACHE_TTL);
      return merged;
    });
    if (!opts?.silent) setLoading(false);
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

    if (snapshot.exists && !snapshot.isStale) {
      return;
    }

    if (snapshot.value) {
      void fetch({ silent: true, force: true });
    } else {
      void fetch();
    }
  }, [fetch, thread?.id, participant?.profileId, participant?.kind]);

  useEffect(() => {
    if (!thread?.id) return;

    const channel = supabase
      .channel(`chat-messages-${thread.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `thread_id=eq.${thread.id}` },
        (payload) => {
          if (activeThreadIdRef.current !== thread.id) return;
          const message = mapReadyChatMessages([payload.new as ChatMessageRow])[0];
          if (!message) return;
          setMessages((current) => {
            const next = mergeMessages(current, [message]);
            if (next.length === current.length) return current;
            updateMessagesCache((cached) => mergeMessages(cached, [message]));
            return next;
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_messages", filter: `thread_id=eq.${thread.id}` },
        (payload) => {
          if (activeThreadIdRef.current !== thread.id) return;
          const message = mapReadyChatMessages([payload.new as ChatMessageRow])[0];
          if (!message) return;
          patchMessages((current) => {
            const existing = current.find((item) => item.id === message.id);
            if (!existing) return current;
            if (
              existing.text === message.text
              && existing.createdAt === message.createdAt
              && existing.readAt === message.readAt
            ) {
              return current;
            }
            if (existing.readAt !== message.readAt) {
              console.debug("[chat-read] realtime update", {
                activeThreadId: thread.id,
                messageId: message.id,
                previousReadAt: existing.readAt ?? null,
                nextReadAt: message.readAt ?? null,
              });
            }
            return mergeMessages(current.filter((item) => item.id !== message.id), [message]);
          });
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [thread?.id, participant?.profileId, participant?.kind, patchMessages, updateMessagesCache]);

  useEffect(() => {
    if (!thread?.id || messages.length === 0) return;

    const selfIds = new Set([currentUserId, participant?.profileId].filter((value): value is string => Boolean(value)));
    const unreadIncomingIds = messages
      .filter((message) => !selfIds.has(message.senderId) && !message.readAt && !markingReadRef.current.has(message.id))
      .map((message) => message.id);

    if (unreadIncomingIds.length === 0) return;

    console.debug("[chat-read] mark requested", {
      activeThreadId: thread.id,
      currentUserId: currentUserId ?? null,
      participantProfileId: participant?.profileId ?? null,
      count: unreadIncomingIds.length,
    });

    unreadIncomingIds.forEach((id) => markingReadRef.current.add(id));
    const readAt = new Date().toISOString();

    patchMessages((current) => current.map((message) => (
      unreadIncomingIds.includes(message.id) ? { ...message, readAt } : message
    )));

    void supabase
      .from("chat_messages")
      .update({ read_at: readAt })
      .in("id", unreadIncomingIds)
      .then(({ error }) => {
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
        console.debug("[chat-read] marked as read", {
          activeThreadId: thread.id,
          currentUserId: currentUserId ?? null,
          participantProfileId: participant?.profileId ?? null,
          count: unreadIncomingIds.length,
        });
      });
  }, [currentUserId, fetch, messages, participant?.profileId, patchMessages, thread?.id]);

  const appendMessage = useCallback((message: ChatMessage) => {
    setMessages((current) => {
      const next = mergeMessages(current, [message]);
      if (next.length === current.length) return current;
      updateMessagesCache((cached) => mergeMessages(cached, [message]));
      return next;
    });
  }, [updateMessagesCache]);

  const replaceMessage = useCallback((tempId: string, message: ChatMessage) => {
    setMessages((current) => {
      const withoutTemp = current.filter((item) => item.id !== tempId);
      const next = mergeMessages(withoutTemp, [message]);
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

  return { messages, loading, refetch: fetch, appendMessage, replaceMessage, removeMessage };
}

export function useChatThreadPreviews(threads: ChatThread[]) {
  const [previews, setPreviews] = useState<Record<string, ChatMessage>>({});
  const threadIds = threads.map((thread) => thread.id).join(",");

  useEffect(() => {
    const fetchPreviews = async () => {
      const ids = threads.map((thread) => thread.id).filter(Boolean);
      if (ids.length === 0) {
        setPreviews({});
        return;
      }

      const key = `chat-previews:${ids.join(",")}`;
      const snapshot = getCacheSnapshot<Record<string, ChatMessage>>(key);
      if (snapshot.value) {
        setPreviews(snapshot.value);
      } else {
        setPreviews({});
      }

      if (snapshot.exists && !snapshot.isStale) {
        return;
      }

      const next = await cachedRequest(key, () => fetchChatPreviews(ids), 30_000);
      setPreviews((current) => {
        const merged = mergePreviews(current, next);
        setCachedValue(key, merged, 30_000);
        return merged;
      });
    };

    void fetchPreviews();
  }, [threadIds]);

  useEffect(() => {
    const ids = threads.map((thread) => thread.id).filter(Boolean);
    if (ids.length === 0) return;

    const idSet = new Set(ids);
    const channel = supabase
      .channel(`chat-message-previews-${threadIds}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          const message = mapReadyChatMessages([payload.new as ChatMessageRow])[0];
          if (!message) return;
          if (!idSet.has(message.threadId)) return;
          setPreviews((current) => {
            const merged = mergePreviews(current, { [message.threadId]: message });
            if (merged[message.threadId] === current[message.threadId]) return current;
            setCachedValue(`chat-previews:${ids.join(",")}`, merged, 30_000);
            return merged;
          });
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
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
