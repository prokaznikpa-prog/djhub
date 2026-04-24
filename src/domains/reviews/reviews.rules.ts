import { canLeaveReview } from "@/domains/bookings/bookings.rules";
import type { Tables } from "@/integrations/supabase/types";

type BookingRow = Tables<"bookings">;

export type ReviewRatingSummary = {
  averageRating: number;
  count: number;
};

export type ReviewRatingInput = {
  rating: number;
};

export function canUserLeaveBookingReview(
  booking: Pick<BookingRow, "status" | "dj_id" | "venue_id">,
  profileId: string | null | undefined,
) {
  return canLeaveReview(booking, profileId);
}

export function getReviewRatingSummary(reviews: ReviewRatingInput[]): ReviewRatingSummary {
  if (reviews.length === 0) return { averageRating: 0, count: 0 };
  return {
    averageRating: reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length,
    count: reviews.length,
  };
}
