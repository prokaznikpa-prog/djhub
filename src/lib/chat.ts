import type { GigThreadAnchor } from "@/lib/gigs";
import type { ProfileKind } from "@/lib/profile";

export interface ChatThread extends GigThreadAnchor {
  id: string;
  createdAt: string;
  updatedAt: string;
  bookingId?: string | null;
  bookingStatus?: string | null;
  bookingCompletedAt?: string | null;
  bookingEventDate?: string | null;
  bookingEventTime?: string | null;
  bookingPostType?: string | null;
  hiddenByDj: boolean;
  hiddenByVenue: boolean;
  gigTitle?: string | null;
  djName?: string | null;
  venueName?: string | null;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  senderId: string;
  text: string;
  createdAt: string;
  readAt?: string | null;
}

export interface ChatParticipant {
  profileId: string;
  kind: ProfileKind;
}

export interface ChatThreadRow {
  id: string;
  application_id: string;
  booking_id?: string | null;
  gig_id: string;
  dj_id: string;
  venue_id: string;
  created_at: string;
  updated_at: string;
  hidden_by_dj?: boolean | null;
  hidden_by_venue?: boolean | null;
  bookings?: { status?: string | null; completed_at?: string | null } | { status?: string | null; completed_at?: string | null }[] | null;
  venue_posts?: { title?: string | null; event_date?: string | null; deadline?: string | null; start_time?: string | null; post_type?: string | null } | { title?: string | null; event_date?: string | null; deadline?: string | null; start_time?: string | null; post_type?: string | null }[] | null;
  dj_profiles?: { name?: string | null } | { name?: string | null }[] | null;
  venue_profiles?: { name?: string | null } | { name?: string | null }[] | null;
}

export interface ChatMessageRow {
  id: string;
  thread_id: string;
  sender_id: string;
  text: string;
  created_at: string;
  read_at?: string | null;
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function safeString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function mapChatThread(row: ChatThreadRow): ChatThread {
  const booking = firstRelation(row.bookings);
  const post = firstRelation(row.venue_posts);
  const dj = firstRelation(row.dj_profiles);
  const venue = firstRelation(row.venue_profiles);

  return {
    id: safeString(row.id) ?? "",
    applicationId: safeString(row.application_id) ?? "",
    bookingId: row.booking_id ?? null,
    bookingStatus: booking?.status ?? null,
    bookingCompletedAt: booking?.completed_at ?? null,
    bookingEventDate: post?.event_date ?? post?.deadline ?? null,
    bookingEventTime: post?.start_time ?? null,
    bookingPostType: post?.post_type ?? null,
    gigId: safeString(row.gig_id) ?? "",
    djId: safeString(row.dj_id) ?? "",
    venueId: safeString(row.venue_id) ?? "",
    createdAt: safeString(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: safeString(row.updated_at) ?? safeString(row.created_at) ?? new Date(0).toISOString(),
    hiddenByDj: row.hidden_by_dj === true,
    hiddenByVenue: row.hidden_by_venue === true,
    gigTitle: post?.title ?? null,
    djName: dj?.name ?? null,
    venueName: venue?.name ?? null,
  };
}

export function mapChatMessage(row: ChatMessageRow): ChatMessage {
  return {
    id: safeString(row.id) ?? "",
    threadId: safeString(row.thread_id) ?? "",
    senderId: safeString(row.sender_id) ?? "",
    text: safeString(row.text) ?? "",
    createdAt: safeString(row.created_at) ?? new Date(0).toISOString(),
    readAt: safeString(row.read_at) ?? null,
  };
}

export function isThreadParticipant(thread: ChatThread, participant: ChatParticipant): boolean {
  return participant.kind === "dj"
    ? thread.djId === participant.profileId
    : thread.venueId === participant.profileId;
}

export function isThreadHiddenForParticipant(thread: ChatThread, participant: ChatParticipant): boolean {
  return participant.kind === "dj" ? thread.hiddenByDj : thread.hiddenByVenue;
}
