import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cachedRequest, getCachedValue, setCachedValue } from "@/lib/requestCache";
import {
  isThreadParticipant,
  isThreadHiddenForParticipant,
  mapChatMessage,
  mapChatThread,
  type ChatMessage,
  type ChatMessageRow,
  type ChatParticipant,
  type ChatThread,
  type ChatThreadRow,
} from "@/lib/chat";

const CHAT_THREADS_TABLE = "chat_threads" as any;
const CHAT_MESSAGES_TABLE = "chat_messages" as any;
const THREAD_SELECT = "*, bookings(status, completed_at), venue_posts(title, event_date), dj_profiles(name), venue_profiles(name)";
const CHAT_CACHE_TTL = 45_000;

function mergeChatThread(current: ChatThread[], incoming: ChatThread) {
  const withoutDuplicate = current.filter((thread) => (
    thread.id !== incoming.id
      && thread.applicationId !== incoming.applicationId
      && (!incoming.bookingId || thread.bookingId !== incoming.bookingId)
  ));

  return [incoming, ...withoutDuplicate].sort((a, b) => (
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  ));
}

async function getReadyBookingForApplication(applicationId: string) {
  const { data: application, error: applicationError } = await supabase
    .from("applications")
    .select("id, status")
    .eq("id", applicationId)
    .eq("status", "accepted")
    .maybeSingle();

  if (applicationError || !application) return null;

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id")
    .eq("application_id", applicationId)
    .maybeSingle();

  return bookingError ? null : booking;
}

async function filterBookingReadyThreads(rows: ChatThreadRow[]) {
  const bookingIds = rows
    .map((thread) => thread.booking_id)
    .filter((bookingId): bookingId is string => !!bookingId);
  if (bookingIds.length === 0) return [];

  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, applications!inner(id, status)")
    .in("id", bookingIds)
    .eq("applications.status", "accepted");

  const readyBookingIds = new Set(((bookings as { id: string }[] | null) ?? []).map((booking) => booking.id));
  return rows.filter((thread) => !!thread.booking_id && readyBookingIds.has(thread.booking_id));
}

async function getReadyBookingForBooking(bookingId: string) {
  const { data: booking, error } = await supabase
    .from("bookings")
    .select("id, application_id, dj_id, venue_id, post_id, applications!inner(id, status)")
    .eq("id", bookingId)
    .eq("applications.status", "accepted")
    .maybeSingle();

  return error ? null : booking as {
    id: string;
    application_id: string;
    dj_id: string;
    venue_id: string;
    post_id: string;
  } | null;
}

export function getChatThreadsCacheKey(participant: ChatParticipant) {
  return `chat-threads:${participant.kind}:${participant.profileId}`;
}

export async function fetchChatThreadsForParticipant(participant: ChatParticipant) {
  const query = supabase
    .from(CHAT_THREADS_TABLE)
    .select(THREAD_SELECT)
    .order("updated_at", { ascending: false });

  const { data } = participant.kind === "dj"
    ? await query.eq("dj_id", participant.profileId)
    : await query.eq("venue_id", participant.profileId);

  const readyThreads = await filterBookingReadyThreads((data as ChatThreadRow[] | null) ?? []);
  return readyThreads
    .map(mapChatThread)
    .filter((thread) => !isThreadHiddenForParticipant(thread, participant));
}

async function restoreThreadVisibility(row: ChatThreadRow) {
  if (row.hidden_by_dj !== true && row.hidden_by_venue !== true) {
    return { data: mapChatThread(row), error: null };
  }

  const restored = await supabase
    .from(CHAT_THREADS_TABLE)
    .update({ hidden_by_dj: false, hidden_by_venue: false })
    .eq("id", row.id)
    .select(THREAD_SELECT)
    .maybeSingle();

  return {
    data: restored.data ? mapChatThread(restored.data as ChatThreadRow) : null,
    error: restored.error,
  };
}

export async function ensureChatThreadForBooking(bookingId: string): Promise<{ data: ChatThread | null; error: Error | null }> {
  const booking = await getReadyBookingForBooking(bookingId);
  if (!booking) {
    return { data: null, error: new Error("Чат доступен только после создания брони") };
  }

  const existingByBooking = await supabase
    .from(CHAT_THREADS_TABLE)
    .select(THREAD_SELECT)
    .eq("booking_id", booking.id)
    .maybeSingle();

  if (existingByBooking.data) {
    return restoreThreadVisibility(existingByBooking.data as ChatThreadRow);
  }

  const existingByApplication = await supabase
    .from(CHAT_THREADS_TABLE)
    .select(THREAD_SELECT)
    .eq("application_id", booking.application_id)
    .maybeSingle();

  if (existingByApplication.data) {
    const existingThread = existingByApplication.data as ChatThreadRow;
    if (!existingThread.booking_id) {
      const repaired = await supabase
        .from(CHAT_THREADS_TABLE)
        .update({ booking_id: booking.id })
        .eq("id", existingThread.id)
        .select(THREAD_SELECT)
        .maybeSingle();

      if (repaired.error) return { data: null, error: repaired.error };
      if (repaired.data) return restoreThreadVisibility(repaired.data as ChatThreadRow);
      existingThread.booking_id = booking.id;
    }

    return restoreThreadVisibility(existingThread);
  }

  const inserted = await supabase
    .from(CHAT_THREADS_TABLE)
    .insert({
      application_id: booking.application_id,
      booking_id: booking.id,
      gig_id: booking.post_id,
      dj_id: booking.dj_id,
      venue_id: booking.venue_id,
    })
    .select(THREAD_SELECT)
    .single();

  if (inserted.error) {
    if (inserted.error.message?.toLowerCase().includes("duplicate")) {
      const retryByBooking = await supabase
        .from(CHAT_THREADS_TABLE)
        .select(THREAD_SELECT)
        .eq("booking_id", booking.id)
        .maybeSingle();

      if (retryByBooking.data || retryByBooking.error) {
        if (retryByBooking.error) return { data: null, error: retryByBooking.error };
        return retryByBooking.data ? restoreThreadVisibility(retryByBooking.data as ChatThreadRow) : { data: null, error: null };
      }

      const retryByApplication = await supabase
        .from(CHAT_THREADS_TABLE)
        .select(THREAD_SELECT)
        .eq("application_id", booking.application_id)
        .maybeSingle();

      if (retryByApplication.error) return { data: null, error: retryByApplication.error };
      return retryByApplication.data ? restoreThreadVisibility(retryByApplication.data as ChatThreadRow) : { data: null, error: null };
    }

    return { data: null, error: inserted.error };
  }

  return { data: mapChatThread(inserted.data as ChatThreadRow), error: null };
}

export async function ensureChatThreadForApplication(applicationId: string): Promise<{ data: ChatThread | null; error: Error | null }> {
  const readyBooking = await getReadyBookingForApplication(applicationId);
  if (!readyBooking) {
    return { data: null, error: new Error("Чат доступен только после принятия отклика и создания брони") };
  }

  return ensureChatThreadForBooking(readyBooking.id);

}

export function useChatThreads(participant: ChatParticipant | null) {
  const cacheKey = participant ? getChatThreadsCacheKey(participant) : null;
  const [threads, setThreads] = useState<ChatThread[]>(() => cacheKey ? getCachedValue<ChatThread[]>(cacheKey) ?? [] : []);
  const [loading, setLoading] = useState(() => cacheKey ? !getCachedValue<ChatThread[]>(cacheKey) : false);

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

    setCachedValue(key, next, CHAT_CACHE_TTL);
    setThreads(next);
    if (!opts?.silent) setLoading(false);
  }, [participant?.profileId, participant?.kind]);

  useEffect(() => {
    if (!participant) {
      void fetch();
      return;
    }

    const key = getChatThreadsCacheKey(participant);
    const cached = getCachedValue<ChatThread[]>(key);
    if (cached) {
      setThreads(cached);
      setLoading(false);
      void fetch({ silent: true, force: true });
    } else {
      void fetch();
    }
    if (!participant) return;

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
    if (!participant || !isThreadParticipant(thread, participant) || isThreadHiddenForParticipant(thread, participant)) return;
    setThreads((current) => {
      const next = mergeChatThread(current, thread);
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

  return { threads, loading, refetch: fetch, addThread, removeThreadLocal, updateThreadLocal };
}

export function useChatMessages(thread: ChatThread | null, participant: ChatParticipant | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = async (opts?: { silent?: boolean }) => {
    if (!thread || !participant || !isThreadParticipant(thread, participant)) {
      setMessages([]);
      return;
    }

    if (!opts?.silent) setLoading(true);
    const { data } = await supabase
      .from(CHAT_MESSAGES_TABLE)
      .select("*")
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: true });

    setMessages(((data as ChatMessageRow[] | null) ?? []).map(mapChatMessage));
    if (!opts?.silent) setLoading(false);
  };

  useEffect(() => { fetch(); }, [thread?.id, participant?.profileId, participant?.kind]);

  useEffect(() => {
    if (!thread || !participant || !isThreadParticipant(thread, participant)) return;

    const channel = supabase
      .channel(`chat-messages-${thread.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `thread_id=eq.${thread.id}` },
        (payload) => {
          const message = mapChatMessage(payload.new as ChatMessageRow);
          setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [thread?.id, participant?.profileId, participant?.kind]);

  const appendMessage = useCallback((message: ChatMessage) => {
    setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
  }, []);

  const replaceMessage = useCallback((tempId: string, message: ChatMessage) => {
    setMessages((current) => {
      const withoutDuplicate = current.filter((item) => item.id !== message.id || item.id === tempId);
      return withoutDuplicate.map((item) => item.id === tempId ? message : item);
    });
  }, []);

  const removeMessage = useCallback((messageId: string) => {
    setMessages((current) => current.filter((item) => item.id !== messageId));
  }, []);

  return { messages, loading, refetch: fetch, appendMessage, replaceMessage, removeMessage };
}

export function useChatThreadPreviews(threads: ChatThread[]) {
  const [previews, setPreviews] = useState<Record<string, ChatMessage>>({});
  const threadIds = threads.map((thread) => thread.id).join(",");

  useEffect(() => {
    const fetchPreviews = async () => {
      const ids = threads.map((thread) => thread.id);

      if (ids.length === 0) {
        setPreviews({});
        return;
      }

      const { data } = await supabase
        .from(CHAT_MESSAGES_TABLE)
        .select("*")
        .in("thread_id", ids)
        .order("created_at", { ascending: false });

      const nextPreviews: Record<string, ChatMessage> = {};
      ((data as ChatMessageRow[] | null) ?? []).forEach((row) => {
        if (!nextPreviews[row.thread_id]) {
          nextPreviews[row.thread_id] = mapChatMessage(row);
        }
      });

      setPreviews(nextPreviews);
    };

    fetchPreviews();
  }, [threadIds]);

  useEffect(() => {
    const ids = threads.map((thread) => thread.id);
    if (ids.length === 0) return;

    const idSet = new Set(ids);
    const channel = supabase
      .channel(`chat-message-previews-${threadIds}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          const message = mapChatMessage(payload.new as ChatMessageRow);
          if (!idSet.has(message.threadId)) return;
          setPreviews((current) => {
            const existing = current[message.threadId];
            if (existing && new Date(existing.createdAt).getTime() >= new Date(message.createdAt).getTime()) return current;
            return { ...current, [message.threadId]: message };
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

export async function sendChatMessage(thread: ChatThread, participant: ChatParticipant, text: string) {
  const trimmed = text.trim();

  if (!isThreadParticipant(thread, participant)) {
    return { data: null, error: new Error("Нет доступа к чату") };
  }

  if (!trimmed) {
    return { data: null, error: new Error("Введите сообщение") };
  }

  const readyBooking = thread.applicationId ? await getReadyBookingForApplication(thread.applicationId) : null;
  if (!readyBooking) {
    return { data: null, error: new Error("Чат доступен только после принятия отклика и создания брони") };
  }

  const { data, error } = await supabase
    .from(CHAT_MESSAGES_TABLE)
    .insert({
      thread_id: thread.id,
      sender_id: participant.profileId,
      text: trimmed.slice(0, 1000),
    })
    .select("*")
    .single();

  if (!error) {
    await supabase
      .from(CHAT_THREADS_TABLE)
      .update({ updated_at: new Date().toISOString() })
      .eq("id", thread.id);
  }

  return {
    data: data ? mapChatMessage(data as ChatMessageRow) : null,
    error,
  };
}

export async function hideChatThreadForParticipant(thread: ChatThread, participant: ChatParticipant) {
  if (!isThreadParticipant(thread, participant)) {
    return { error: new Error("Нет доступа к чату") };
  }

  const column = participant.kind === "dj" ? "hidden_by_dj" : "hidden_by_venue";
  const { error } = await supabase
    .from(CHAT_THREADS_TABLE)
    .update({ [column]: true })
    .eq("id", thread.id);

  return { error };
}
