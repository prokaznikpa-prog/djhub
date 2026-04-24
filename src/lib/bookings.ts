import type { Tables } from "@/integrations/supabase/types";
import type { ApplicationStatusInput } from "@/lib/applications";
import { isApplicationAccepted, isApplicationPending } from "@/lib/applications";
import type { GigApplication } from "@/lib/gigs";

export type Booking = Tables<"bookings">;
export type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled";
export type BookingParticipant = Pick<Booking, "dj_id" | "venue_id">;
export type BookingWithEventDate = Pick<Booking, "status"> & {
  eventDate?: string | null;
  eventTime?: string | null;
  postType?: string | null;
  venue_posts?: { event_date?: string | null; deadline?: string | null; start_time?: string | null; post_type?: string | null } | null;
};

export const BOOKING_STATUSES: BookingStatus[] = ["pending", "confirmed", "completed", "cancelled"];
export const DEFAULT_BOOKING_STATUS: BookingStatus = "pending";

export function normalizeBookingStatus(status: string | null | undefined): BookingStatus {
  return BOOKING_STATUSES.includes(status as BookingStatus) ? status as BookingStatus : DEFAULT_BOOKING_STATUS;
}

export function isBookingParticipant(booking: BookingParticipant, profileId: string | null | undefined): boolean {
  return !!profileId && (booking.dj_id === profileId || booking.venue_id === profileId);
}

export function parseBookingEventDateTime(
  eventDate?: string | null,
  eventTime?: string | null,
): Date | null {
  const rawDate = eventDate?.trim();
  const rawTime = eventTime?.trim() ?? "";
  if (!rawDate) return null;

  const localizedMatch = rawDate.match(
    /^(\d{2})\.(\d{2})\.(\d{4})(?:\s*(?:в)?\s+(\d{2}):(\d{2}))?$/,
  );

  if (localizedMatch) {
    const [, day, month, year, dateHour, dateMinute] = localizedMatch;
    const hour = dateHour ?? (rawTime.match(/^(\d{2}):(\d{2})/)?.[1] ?? "00");
    const minute = dateMinute ?? (rawTime.match(/^(\d{2}):(\d{2})/)?.[2] ?? "00");
    const parsed = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    const [year, month, day] = rawDate.split("-").map(Number);
    const timeMatch = rawTime.match(/^(\d{2}):(\d{2})/);
    if (timeMatch) {
      const [, hour, minute] = timeMatch;
      const parsed = new Date(year, month - 1, day, Number(hour), Number(minute));
      return Number.isFinite(parsed.getTime()) ? parsed : null;
    }

    const parsed = new Date(year, month - 1, day);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  const parsed = new Date(rawDate);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function hasBookingEventDatePassed(booking: BookingWithEventDate, now = new Date()): boolean {
  const eventDate = booking.eventDate ?? booking.venue_posts?.event_date ?? booking.venue_posts?.deadline ?? null;
  const eventTime = booking.eventTime ?? booking.venue_posts?.start_time ?? null;
  const postType = booking.postType ?? booking.venue_posts?.post_type ?? null;
  if (!eventDate) return false;

  if (/^\d{4}-\d{2}-\d{2}$/.test(eventDate) && !(eventTime && /^\d{2}:\d{2}/.test(eventTime))) {
    const [year, month, day] = eventDate.split("-").map(Number);
    const nextDayStart = new Date(year, month - 1, day + 1);
    return now.getTime() >= nextDayStart.getTime();
  }

  const parsed = parseBookingEventDateTime(eventDate, eventTime);
  if (!parsed) {
    if (typeof window !== "undefined" && import.meta.env.DEV) {
      console.warn("Failed to parse booking event date", { eventDate, eventTime, postType });
    }
    return false;
  }
  return parsed.getTime() < now.getTime();
}

export function canConfirmBooking(booking: Pick<Booking, "status">): boolean {
  return normalizeBookingStatus(booking.status) === "pending";
}

export function canCompleteBooking(booking: BookingWithEventDate, now = new Date()): boolean {
  return normalizeBookingStatus(booking.status) === "confirmed" && hasBookingEventDatePassed(booking, now);
}

export function canCancelBooking(booking: Pick<Booking, "status">): boolean {
  return ["pending", "confirmed"].includes(normalizeBookingStatus(booking.status));
}

export function canLeaveReview(booking: Pick<Booking, "status" | "dj_id" | "venue_id">, profileId: string | null | undefined): boolean {
  return normalizeBookingStatus(booking.status) === "completed" && isBookingParticipant(booking, profileId);
}

export function canCreateBookingFromApplication(application: Pick<GigApplication, "status">): boolean {
  return isApplicationAccepted(application);
}

export function shouldCreateBookingForStatusTransition(
  previousStatus: ApplicationStatusInput,
  nextStatus: ApplicationStatusInput,
): boolean {
  return isApplicationPending(previousStatus) && isApplicationAccepted(nextStatus);
}
