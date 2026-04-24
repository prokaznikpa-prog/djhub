import { supabase } from "@/integrations/supabase/client";
import {
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
const THREAD_BASE_SELECT = "id,application_id,booking_id,gig_id,dj_id,venue_id,created_at,updated_at,hidden_by_dj,hidden_by_venue";
const THREAD_SELECT = `${THREAD_BASE_SELECT}, bookings(status, completed_at), venue_posts(title, event_date, deadline, start_time, post_type), dj_profiles(name), venue_profiles(name)`;

export const CHAT_CACHE_TTL = 45_000;

type ReadyBooking = {
  id: string;
  application_id: string;
  dj_id: string;
  venue_id: string;
  post_id: string;
};

export function getChatThreadsCacheKey(participant: ChatParticipant) {
  return `chat-threads:${participant.kind}:${participant.profileId}`;
}

export function sanitizeChatThread(thread: ChatThread | null | undefined): ChatThread | null {
  if (!thread || typeof thread.id !== "string" || !thread.id) return null;
  return {
    ...thread,
    id: thread.id,
    applicationId: typeof thread.applicationId === "string" ? thread.applicationId : "",
    bookingId: typeof thread.bookingId === "string" ? thread.bookingId : null,
    bookingStatus: typeof thread.bookingStatus === "string" ? thread.bookingStatus : null,
    bookingCompletedAt: typeof thread.bookingCompletedAt === "string" ? thread.bookingCompletedAt : null,
    bookingEventDate: typeof thread.bookingEventDate === "string" ? thread.bookingEventDate : null,
    bookingEventTime: typeof thread.bookingEventTime === "string" ? thread.bookingEventTime : null,
    bookingPostType: typeof thread.bookingPostType === "string" ? thread.bookingPostType : null,
    gigId: typeof thread.gigId === "string" ? thread.gigId : "",
    djId: typeof thread.djId === "string" ? thread.djId : "",
    venueId: typeof thread.venueId === "string" ? thread.venueId : "",
    createdAt: typeof thread.createdAt === "string" ? thread.createdAt : new Date(0).toISOString(),
    updatedAt: typeof thread.updatedAt === "string" ? thread.updatedAt : new Date(0).toISOString(),
    gigTitle: typeof thread.gigTitle === "string" ? thread.gigTitle : null,
    djName: typeof thread.djName === "string" ? thread.djName : null,
    venueName: typeof thread.venueName === "string" ? thread.venueName : null,
  };
}

export function sanitizeChatThreads(threads: ChatThread[], participant?: ChatParticipant | null) {
  return threads.flatMap((thread) => {
    const safeThread = sanitizeChatThread(thread);
    if (!safeThread) {
      console.warn("Skipping malformed chat thread", thread);
      return [];
    }
    if (participant && isThreadHiddenForParticipant(safeThread, participant)) return [];
    return [safeThread];
  });
}

export function mergeChatThread(current: ChatThread[], incoming: ChatThread) {
  const safeIncoming = sanitizeChatThread(incoming);
  if (!safeIncoming) return current;

  const withoutDuplicate = current.filter((thread) => (
    thread.id !== safeIncoming.id
      && (!safeIncoming.applicationId || thread.applicationId !== safeIncoming.applicationId)
      && (!safeIncoming.bookingId || thread.bookingId !== safeIncoming.bookingId)
  ));

  return [safeIncoming, ...withoutDuplicate].sort((a, b) => (
    getThreadTimestamp(b.updatedAt) - getThreadTimestamp(a.updatedAt)
  ));
}

export function mapReadyChatThreads(rows: ChatThreadRow[]) {
  return rows.flatMap((row) => {
    try {
      const thread = sanitizeChatThread(mapChatThread(row));
      return thread ? [thread] : [];
    } catch (error) {
      console.error("Failed to map chat thread", { error, row });
      return [];
    }
  });
}

export function mapReadyChatMessages(rows: ChatMessageRow[]) {
  return rows.flatMap((row) => {
    try {
      const message = mapChatMessage(row);
      return message.id && message.threadId && message.senderId ? [message] : [];
    } catch (error) {
      console.error("Failed to map chat message", { error, row });
      return [];
    }
  });
}

export function resolveOtherParticipantLabel(thread: ChatThread, participant: ChatParticipant) {
  return participant.kind === "dj" ? thread.venueName || "Загрузка..." : thread.djName || "Загрузка...";
}

export function resolveSenderLabel(thread: ChatThread, senderId: string) {
  if (senderId && thread.djId && senderId === thread.djId) return thread.djName || "DJ";
  if (senderId && thread.venueId && senderId === thread.venueId) return thread.venueName || "Заведение";
  return senderId === thread.djId ? "DJ" : "Заведение";
}

export function getThreadTimestamp(value?: string | null) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
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

async function getReadyBookingForBooking(bookingId: string): Promise<ReadyBooking | null> {
  const { data: booking, error } = await supabase
    .from("bookings")
    .select("id, application_id, dj_id, venue_id, post_id")
    .eq("id", bookingId)
    .maybeSingle();

  if (error || !booking) return null;

  const { data: application, error: applicationError } = await supabase
    .from("applications")
    .select("id, status")
    .eq("id", (booking as { application_id: string }).application_id)
    .eq("status", "accepted")
    .maybeSingle();

  if (applicationError || !application) return null;
  return booking as ReadyBooking;
}

async function restoreThreadVisibility(row: ChatThreadRow) {
  if (row.hidden_by_dj !== true && row.hidden_by_venue !== true) {
    return { data: sanitizeChatThread(mapChatThread(row)), error: null };
  }

  let restored = await supabase
    .from(CHAT_THREADS_TABLE)
    .update({ hidden_by_dj: false, hidden_by_venue: false })
    .eq("id", row.id)
    .select(THREAD_SELECT)
    .maybeSingle();

  if (restored.error) {
    console.warn("Failed to restore enriched chat thread, retrying base row", restored.error);
    restored = await supabase
      .from(CHAT_THREADS_TABLE)
      .update({ hidden_by_dj: false, hidden_by_venue: false })
      .eq("id", row.id)
      .select(THREAD_BASE_SELECT)
      .maybeSingle();
  }

  return {
    data: restored.data ? sanitizeChatThread(mapChatThread(restored.data as ChatThreadRow)) : null,
    error: restored.error,
  };
}

export async function fetchChatThreadsForParticipant(participant: ChatParticipant) {
  const runQuery = async (select: string) => {
    const query = supabase
      .from(CHAT_THREADS_TABLE)
      .select(select)
      .order("updated_at", { ascending: false });

    return participant.kind === "dj"
      ? await query.eq("dj_id", participant.profileId)
      : await query.eq("venue_id", participant.profileId);
  };

  let { data, error } = await runQuery(THREAD_SELECT);
  if (error) {
    console.warn("Failed to load enriched chat threads, retrying base rows", error);
    const fallback = await runQuery(THREAD_BASE_SELECT);
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    console.error("Failed to load chat threads", error);
    return [];
  }

  return sanitizeChatThreads(mapReadyChatThreads((data as ChatThreadRow[] | null) ?? []), participant);
}

export async function ensureChatThreadForBooking(bookingId: string): Promise<{ data: ChatThread | null; error: Error | null }> {
  const booking = await getReadyBookingForBooking(bookingId);
  if (!booking) {
    return { data: null, error: new Error("Чат доступен только после создания брони") };
  }

  let existingByBooking = await supabase
    .from(CHAT_THREADS_TABLE)
    .select(THREAD_SELECT)
    .eq("booking_id", booking.id)
    .maybeSingle();
  if (existingByBooking.error) {
    existingByBooking = await supabase
      .from(CHAT_THREADS_TABLE)
      .select(THREAD_BASE_SELECT)
      .eq("booking_id", booking.id)
      .maybeSingle();
  }

  if (existingByBooking.data) {
    return restoreThreadVisibility(existingByBooking.data as ChatThreadRow);
  }

  let existingByApplication = await supabase
    .from(CHAT_THREADS_TABLE)
    .select(THREAD_SELECT)
    .eq("application_id", booking.application_id)
    .maybeSingle();
  if (existingByApplication.error) {
    existingByApplication = await supabase
      .from(CHAT_THREADS_TABLE)
      .select(THREAD_BASE_SELECT)
      .eq("application_id", booking.application_id)
      .maybeSingle();
  }

  if (existingByApplication.data) {
    const existingThread = existingByApplication.data as ChatThreadRow;
    if (!existingThread.booking_id) {
      let repaired = await supabase
        .from(CHAT_THREADS_TABLE)
        .update({ booking_id: booking.id })
        .eq("id", existingThread.id)
        .select(THREAD_SELECT)
        .maybeSingle();
      if (repaired.error) {
        repaired = await supabase
          .from(CHAT_THREADS_TABLE)
          .update({ booking_id: booking.id })
          .eq("id", existingThread.id)
          .select(THREAD_BASE_SELECT)
          .maybeSingle();
      }

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
    .select(THREAD_BASE_SELECT)
    .single();

  if (inserted.error) {
    if (inserted.error.message?.toLowerCase().includes("duplicate")) {
      const retryByBooking = await supabase
        .from(CHAT_THREADS_TABLE)
        .select(THREAD_BASE_SELECT)
        .eq("booking_id", booking.id)
        .maybeSingle();

      if (retryByBooking.data || retryByBooking.error) {
        if (retryByBooking.error) return { data: null, error: retryByBooking.error };
        return retryByBooking.data ? restoreThreadVisibility(retryByBooking.data as ChatThreadRow) : { data: null, error: null };
      }

      const retryByApplication = await supabase
        .from(CHAT_THREADS_TABLE)
        .select(THREAD_BASE_SELECT)
        .eq("application_id", booking.application_id)
        .maybeSingle();

      if (retryByApplication.error) return { data: null, error: retryByApplication.error };
      return retryByApplication.data ? restoreThreadVisibility(retryByApplication.data as ChatThreadRow) : { data: null, error: null };
    }

    return { data: null, error: inserted.error };
  }

  return { data: sanitizeChatThread(mapChatThread(inserted.data as ChatThreadRow)), error: null };
}

export async function ensureChatThreadForApplication(applicationId: string): Promise<{ data: ChatThread | null; error: Error | null }> {
  const readyBooking = await getReadyBookingForApplication(applicationId);
  if (!readyBooking) {
    return { data: null, error: new Error("Чат доступен только после принятия отклика и создания брони") };
  }

  return ensureChatThreadForBooking(readyBooking.id);
}

export async function fetchChatMessages(threadId: string) {
  const { data, error } = await supabase
    .from(CHAT_MESSAGES_TABLE)
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to load chat messages", { error, threadId });
    return [];
  }

  return mapReadyChatMessages((data as ChatMessageRow[] | null) ?? []);
}

export async function fetchChatPreviews(threadIds: string[]) {
  const ids = threadIds.filter(Boolean);
  if (ids.length === 0) return {};

  const { data, error } = await supabase
    .from(CHAT_MESSAGES_TABLE)
    .select("id, thread_id, sender_id, text, created_at")
    .in("thread_id", ids)
    .order("created_at", { ascending: false })
    .limit(Math.max(ids.length * 4, 40));

  if (error) {
    console.error("Failed to load chat previews", error);
    return {};
  }

  const nextPreviews: Record<string, ChatMessage> = {};
  mapReadyChatMessages((data as ChatMessageRow[] | null) ?? []).forEach((message) => {
    if (!nextPreviews[message.threadId]) {
      nextPreviews[message.threadId] = message;
    }
  });

  return nextPreviews;
}

export async function sendChatMessage(thread: ChatThread, participant: ChatParticipant, text: string) {
  const trimmed = text.trim();

  if (!thread?.id || !participant?.profileId) {
    return { data: null, error: new Error("Нет доступа к чату") };
  }

  if (!trimmed) {
    return { data: null, error: new Error("Введите сообщение") };
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
  if (!thread?.id || !participant?.kind) {
    return { error: new Error("Нет доступа к чату") };
  }

  const column = participant.kind === "dj" ? "hidden_by_dj" : "hidden_by_venue";
  const { error } = await supabase
    .from(CHAT_THREADS_TABLE)
    .update({ [column]: true })
    .eq("id", thread.id);

  return { error };
}
