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
import { supabase } from "@/integrations/supabase/client";

const API_URL = import.meta.env.VITE_API_URL;
const READ_REQUEST_TIMEOUT_MS = 3000;
const MUTATION_REQUEST_TIMEOUT_MS = 6000;

export const CHAT_CACHE_TTL = 45_000;

async function getAuthHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

async function fetchJson<T>(url: string, fallback: T, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), READ_REQUEST_TIMEOUT_MS);

  try {
    const authHeaders = await getAuthHeaders();
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) return fallback;

    const payload = await response.json() as { ok?: boolean; data?: T };
    return payload.data ?? fallback;
  } catch {
    return fallback;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function mutateJson<T>(url: string, init?: RequestInit): Promise<{ data: T | null; error: Error | null }> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), MUTATION_REQUEST_TIMEOUT_MS);

  try {
    const authHeaders = await getAuthHeaders();
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
        ...(init?.headers ?? {}),
      },
    });

    const payload = await response.json().catch(() => null) as { ok?: boolean; data?: T; error?: string } | null;
    if (!response.ok || payload?.ok === false) {
      return { data: null, error: new Error(payload?.error ?? `Request failed with ${response.status}`) };
    }

    return { data: payload?.data ?? null, error: null };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { data: null, error: new Error("Сервер долго отвечает") };
    }
    return { data: null, error: error instanceof Error ? error : new Error("Request failed") };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function toQuery(params: Record<string, string | undefined>) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) searchParams.set(key, value);
  });
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

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

export async function fetchChatThreadsForParticipant(participant: ChatParticipant) {
  const rows = await fetchJson<ChatThreadRow[]>(
    `${API_URL}/api/chat-threads${toQuery({
      participantKind: participant.kind,
      profileId: participant.profileId,
    })}`,
    [],
  );

  return sanitizeChatThreads(mapReadyChatThreads(rows), participant);
}

export async function fetchChatThreadById(threadId: string, participant?: ChatParticipant | null) {
  if (!threadId) return null;

  const rows = await fetchJson<ChatThreadRow[]>(
    `${API_URL}/api/chat-threads${toQuery({
      threadId,
      participantKind: participant?.kind,
      profileId: participant?.profileId,
    })}`,
    [],
  );

  const thread = mapReadyChatThreads(rows)[0] ?? null;
  const safeThread = sanitizeChatThread(thread);
  if (!safeThread) return null;
  if (participant && isThreadHiddenForParticipant(safeThread, participant)) return null;
  return safeThread;
}

export async function ensureChatThreadForBooking(bookingId: string): Promise<{ data: ChatThread | null; error: Error | null }> {
  const { data, error } = await mutateJson<ChatThreadRow>(
    `${API_URL}/api/chat-threads/ensure-booking`,
    {
      method: "POST",
      body: JSON.stringify({ bookingId }),
    },
  );

  return {
    data: data ? sanitizeChatThread(mapChatThread(data)) : null,
    error,
  };
}

export async function ensureChatThreadForApplication(applicationId: string): Promise<{ data: ChatThread | null; error: Error | null }> {
  const { data, error } = await mutateJson<ChatThreadRow>(
    `${API_URL}/api/chat-threads/ensure-application`,
    {
      method: "POST",
      body: JSON.stringify({ applicationId }),
    },
  );

  return {
    data: data ? sanitizeChatThread(mapChatThread(data)) : null,
    error,
  };
}

export async function fetchChatMessages(threadId: string) {
  const rows = await fetchJson<ChatMessageRow[]>(
    `${API_URL}/api/chat-messages${toQuery({ threadId })}`,
    [],
  );

  return mapReadyChatMessages(rows);
}

export async function fetchChatPreviews(threadIds: string[]) {
  const ids = threadIds.filter(Boolean);
  if (ids.length === 0) return {};

  const rows = await fetchJson<ChatMessageRow[]>(
    `${API_URL}/api/chat-previews${toQuery({ threadIds: ids.join(",") })}`,
    [],
  );

  const nextPreviews: Record<string, ChatMessage> = {};
  mapReadyChatMessages(rows).forEach((message) => {
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

  const { data, error } = await mutateJson<ChatMessageRow>(
    `${API_URL}/api/chat-messages`,
    {
      method: "POST",
      body: JSON.stringify({
        thread_id: thread.id,
        sender_id: participant.profileId,
        text: trimmed,
      }),
    },
  );

  return {
    data: data ? mapChatMessage(data) : null,
    error,
  };
}

export async function markChatMessagesRead(ids: string[], readAt: string) {
  if (ids.length === 0) {
    return { data: [] as ChatMessage[], error: null };
  }

  const { data, error } = await mutateJson<ChatMessageRow[]>(
    `${API_URL}/api/chat-messages/read`,
    {
      method: "PATCH",
      body: JSON.stringify({ ids, read_at: readAt }),
    },
  );

  return {
    data: mapReadyChatMessages(data ?? []),
    error,
  };
}

export async function hideChatThreadForParticipant(thread: ChatThread, participant: ChatParticipant) {
  if (!thread?.id || !participant?.kind) {
    return { error: new Error("Нет доступа к чату") };
  }

  const column = participant.kind === "dj" ? "hidden_by_dj" : "hidden_by_venue";
  const { error } = await mutateJson<ChatThreadRow>(
    `${API_URL}/api/chat-threads/${thread.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({ [column]: true }),
    },
  );

  return { error };
}
