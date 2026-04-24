import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  canUserLeaveBookingReview,
  getReviewRatingSummary,
  type ReviewRatingSummary,
} from "@/domains/reviews/reviews.rules";

export {
  canUserLeaveBookingReview,
  getReviewRatingSummary,
};
export type { ReviewRatingSummary };

export type ReviewRow = {
  id: string;
  booking_id: string;
  reviewer_id: string;
  target_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

export function useReviewsForProfile(profileId: string | undefined) {
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = async () => {
    if (!profileId) {
      setReviews([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data } = await (supabase as any)
      .from("reviews")
      .select("*")
      .eq("target_id", profileId)
      .order("created_at", { ascending: false });
    setReviews((data as ReviewRow[] | null) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void fetch();
  }, [profileId]);

  const summary = useMemo(() => getReviewRatingSummary(reviews), [reviews]);

  return { reviews, averageRating: summary.averageRating, count: summary.count, summary, loading, refetch: fetch };
}

export async function getReviewForBooking(bookingId: string, reviewerId: string) {
  const { data, error } = await (supabase as any)
    .from("reviews")
    .select("*")
    .eq("booking_id", bookingId)
    .eq("reviewer_id", reviewerId)
    .maybeSingle();

  if (error) return { data: null, error: new Error("Не удалось проверить отзыв") };
  return { data: data as ReviewRow | null, error: null };
}

export async function createBookingReview(input: {
  bookingId: string;
  reviewerId: string;
  targetId: string;
  rating: number;
  comment?: string;
}) {
  if (input.rating < 1 || input.rating > 5) {
    return { data: null, error: new Error("Оценка должна быть от 1 до 5") };
  }

  const { data, error } = await (supabase as any)
    .from("reviews")
    .insert({
      booking_id: input.bookingId,
      reviewer_id: input.reviewerId,
      target_id: input.targetId,
      rating: input.rating,
      comment: input.comment?.trim() ? input.comment.trim() : null,
    })
    .select("*")
    .maybeSingle();

  if (error) {
    const message = (error.message ?? "").toLowerCase();
    if ((error as any).code === "23505") return { data: null, error: new Error("Вы уже оставили отзыв по этой брони") };
    if (message.includes("completed booking")) return { data: null, error: new Error("Отзыв можно оставить только после завершения брони") };
    if (message.includes("participants")) return { data: null, error: new Error("Оставить отзыв могут только участники брони") };
    return { data: null, error };
  }

  return { data: data as ReviewRow | null, error: null };
}
