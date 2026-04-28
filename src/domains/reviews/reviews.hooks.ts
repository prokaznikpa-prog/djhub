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

const API_URL = import.meta.env.VITE_API_URL;
const REVIEWS_TIMEOUT_MS = 6000;

export type ReviewRow = {
  id: string;
  booking_id: string;
  reviewer_id: string;
  target_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

async function fetchProfileReviewsFromBackend(profileId: string): Promise<ReviewRow[]> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REVIEWS_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_URL}/api/profiles/${profileId}/reviews`, {
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Backend responded with ${response.status}`);
    }

    const payload = await response.json() as ReviewRow[] | { ok?: boolean; data?: ReviewRow[]; error?: string };

    if (Array.isArray(payload)) {
      return payload;
    }

    if (payload?.ok && Array.isArray(payload.data)) {
      return payload.data;
    }

    return [];
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return [];
    }

    return [];
  } finally {
    window.clearTimeout(timeoutId);
  }
}

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
    const data = await fetchProfileReviewsFromBackend(profileId);
    setReviews(data);
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
