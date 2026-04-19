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
  bookings?: { status: string; completed_at?: string | null } | null;
  venue_posts?: { title: string; event_date?: string | null } | null;
  dj_profiles?: { name: string } | null;
  venue_profiles?: { name: string } | null;
}

export interface ChatMessageRow {
  id: string;
  thread_id: string;
  sender_id: string;
  text: string;
  created_at: string;
}

export function mapChatThread(row: ChatThreadRow): ChatThread {
  return {
    id: row.id,
    applicationId: row.application_id,
    bookingId: row.booking_id ?? null,
    bookingStatus: row.bookings?.status ?? null,
    bookingCompletedAt: row.bookings?.completed_at ?? null,
    bookingEventDate: row.venue_posts?.event_date ?? null,
    gigId: row.gig_id,
    djId: row.dj_id,
    venueId: row.venue_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    hiddenByDj: row.hidden_by_dj === true,
    hiddenByVenue: row.hidden_by_venue === true,
    gigTitle: row.venue_posts?.title ?? null,
    djName: row.dj_profiles?.name ?? null,
    venueName: row.venue_profiles?.name ?? null,
  };
}

export function mapChatMessage(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    senderId: row.sender_id,
    text: row.text,
    createdAt: row.created_at,
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
