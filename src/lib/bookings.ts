import type { Tables } from "@/integrations/supabase/types";
import type { ApplicationStatusInput } from "@/lib/applications";
import { isApplicationAccepted, isApplicationPending } from "@/lib/applications";
import type { GigApplication } from "@/lib/gigs";

export type Booking = Tables<"bookings">;
export type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled";
export type BookingParticipant = Pick<Booking, "dj_id" | "venue_id">;
export type BookingWithEventDate = Pick<Booking, "status"> & {
  eventDate?: string | null;
  venue_posts?: { event_date?: string | null } | null;
};

export const BOOKING_STATUSES: BookingStatus[] = ["pending", "confirmed", "completed", "cancelled"];
export const DEFAULT_BOOKING_STATUS: BookingStatus = "pending";

export function normalizeBookingStatus(status: string | null | undefined): BookingStatus {
  return BOOKING_STATUSES.includes(status as BookingStatus) ? status as BookingStatus : DEFAULT_BOOKING_STATUS;
}

export function isBookingParticipant(booking: BookingParticipant, profileId: string | null | undefined): boolean {
  return !!profileId && (booking.dj_id === profileId || booking.venue_id === profileId);
}

export function hasBookingEventDatePassed(booking: BookingWithEventDate, now = new Date()): boolean {
  const eventDate = booking.eventDate ?? booking.venue_posts?.event_date ?? null;
  if (!eventDate) return false;

  if (/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    const [year, month, day] = eventDate.split("-").map(Number);
    const nextDayStart = new Date(year, month - 1, day + 1);
    return now.getTime() >= nextDayStart.getTime();
  }

  const parsed = new Date(eventDate);
  return Number.isFinite(parsed.getTime()) && parsed.getTime() < now.getTime();
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
