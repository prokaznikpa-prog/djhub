import type { BookingStatus } from "@/lib/bookings";

export {
  BOOKING_STATUSES,
  DEFAULT_BOOKING_STATUS,
  canCancelBooking,
  canCompleteBooking,
  canConfirmBooking,
  canCreateBookingFromApplication,
  canLeaveReview,
  hasBookingEventDatePassed,
  isBookingParticipant,
  normalizeBookingStatus,
  shouldCreateBookingForStatusTransition,
  type Booking,
  type BookingParticipant,
  type BookingStatus,
  type BookingWithEventDate,
} from "@/lib/bookings";

export function getBookingStatusTimestampPatch(status: BookingStatus) {
  const now = new Date().toISOString();
  if (status === "confirmed") return { confirmed_at: now };
  if (status === "completed") return { completed_at: now };
  if (status === "cancelled") return { cancelled_at: now };
  return {};
}
