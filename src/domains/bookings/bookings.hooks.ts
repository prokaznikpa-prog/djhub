import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import type { GigApplication, GigStatus, GigType } from "@/lib/gigs";
import { patchCachedListsWhere, setCachedValue } from "@/lib/requestCache";
import {
  DEFAULT_BOOKING_STATUS,
  canCancelBooking,
  canCompleteBooking,
  canConfirmBooking,
  canCreateBookingFromApplication,
  getBookingStatusTimestampPatch,
  normalizeBookingStatus,
  type BookingStatus,
} from "@/domains/bookings/bookings.rules";
import {
  parseVenuePostsFiltersKey,
  postMatchesVenuePostsFilters,
} from "@/domains/posts/posts.rules";

export type BookingRow = Tables<"bookings">;
type VenuePost = Tables<"venue_posts">;

const CACHE_TTL = 90_000;

function isUniqueViolation(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === "23505" || (error?.message?.toLowerCase() ?? "").includes("duplicate");
}

function syncVenuePostCaches(post: VenuePost) {
  patchCachedListsWhere<VenuePost>(
    (key) => key.startsWith("venue-posts:") || key.startsWith("venue-posts-by-venue:"),
    (items, key) => {
      const withoutPost = items.filter((item) => item.id !== post.id);
      const shouldInclude = key.startsWith("venue-posts-by-venue:")
        ? key === `venue-posts-by-venue:${post.venue_id}`
        : postMatchesVenuePostsFilters(
          post as VenuePost & {
            status: GigStatus;
            post_type: GigType;
            music_styles: string[];
          },
          parseVenuePostsFiltersKey(key),
        );
      return shouldInclude
        ? [post, ...withoutPost].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        : withoutPost;
    },
    CACHE_TTL,
  );
}

export async function getBookingForApplication(applicationId: string) {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("application_id", applicationId)
    .maybeSingle();
  return { data, error };
}

export async function hasBookingForApplication(applicationId: string) {
  const { data, error } = await getBookingForApplication(applicationId);
  return { data, error, exists: !!data };
}

export async function createBookingForAcceptedApplication(applicationId: string) {
  const existing = await getBookingForApplication(applicationId);
  if (existing.error) return { data: null, error: existing.error, alreadyExists: false };
  if (existing.data) {
    return { data: existing.data, error: null, alreadyExists: true };
  }

  const { data: application, error: applicationError } = await supabase
    .from("applications")
    .select("id, dj_id, post_id, status, venue_posts!inner(venue_id)")
    .eq("id", applicationId)
    .maybeSingle();

  if (applicationError) return { data: null, error: applicationError, alreadyExists: false };
  if (!application) {
    return {
      data: null,
      error: new Error("Отклик не найден, бронь не создана"),
      alreadyExists: false,
    };
  }

  const source = application as unknown as Pick<GigApplication, "id" | "dj_id" | "post_id" | "status"> & {
    venue_posts: Pick<Tables<"venue_posts">, "venue_id"> | null;
  };

  if (!canCreateBookingFromApplication(source)) {
    return {
      data: null,
      error: new Error("Бронь можно создать только для принятого отклика"),
      alreadyExists: false,
    };
  }

  const venueId = source.venue_posts?.venue_id;
  if (!venueId) {
    return {
      data: null,
      error: new Error("У публикации не найдено заведение, бронь не создана"),
      alreadyExists: false,
    };
  }

  const booking: TablesInsert<"bookings"> = {
    application_id: source.id,
    dj_id: source.dj_id,
    venue_id: venueId,
    post_id: source.post_id,
    status: DEFAULT_BOOKING_STATUS,
  };

  const inserted = await supabase
    .from("bookings")
    .insert(booking)
    .select("*")
    .single();

  if (inserted.error) {
    if (isUniqueViolation(inserted.error)) {
      const retry = await getBookingForApplication(applicationId);
      return {
        data: retry.data,
        error: retry.error ?? (retry.data ? null : inserted.error),
        alreadyExists: !!retry.data,
      };
    }

    return { data: null, error: inserted.error, alreadyExists: false };
  }

  return { data: inserted.data, error: null, alreadyExists: false };
}

async function markVenuePostSelected(postId: string) {
  const { data } = await supabase
    .from("venue_posts")
    .update({ status: "closed" })
    .eq("id", postId)
    .eq("status", "open")
    .select("*")
    .maybeSingle();

  if (data) {
    const updatedPost = data as VenuePost;
    syncVenuePostCaches(updatedPost);
    setCachedValue(`post:${postId}`, updatedPost, CACHE_TTL);
  }
}

export function useBookingsForParticipant(profileId: string | undefined, kind: "dj" | "venue") {
  const [bookings, setBookings] = useState<(BookingRow & { venue_posts?: Pick<VenuePost, "event_date" | "title"> | null })[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = async (opts?: { silent?: boolean }) => {
    if (!profileId) {
      setBookings([]);
      setLoading(false);
      return;
    }

    if (!opts?.silent) setLoading(true);
    const column = kind === "dj" ? "dj_id" : "venue_id";
    const { data } = await supabase
      .from("bookings")
      .select("*, venue_posts(event_date, deadline, start_time, post_type, title)")
      .eq(column, profileId)
      .order("created_at", { ascending: false });

    setBookings((data as any) ?? []);
    if (!opts?.silent) setLoading(false);
  };

  useEffect(() => {
    fetch();
    if (!profileId) return;

    const column = kind === "dj" ? "dj_id" : "venue_id";
    const channel = supabase
      .channel(`bookings-${kind}-${profileId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `${column}=eq.${profileId}` },
        () => { void fetch({ silent: true }); },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profileId, kind]);

  const updateBookingLocal = (bookingId: string, updates: Partial<BookingRow>) => {
    setBookings((current) => current.map((booking) => (
      booking.id === bookingId ? { ...booking, ...updates } : booking
    )));
  };

  return { bookings, loading, refetch: fetch, updateBookingLocal };
}

export async function updateBookingStatus(id: string, status: BookingStatus) {
  const nextStatus = normalizeBookingStatus(status);
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("*, venue_posts(event_date, deadline, start_time, post_type)")
    .eq("id", id)
    .maybeSingle();

  if (bookingError) return { data: null, error: bookingError };
  if (!booking) return { data: null, error: new Error("Бронь не найдена или недоступна для обновления") };

  const current = booking as BookingRow & { venue_posts?: Pick<VenuePost, "event_date" | "deadline" | "start_time" | "post_type"> | null };

  if (nextStatus === "pending") {
    return { data: null, error: new Error("Бронь нельзя вернуть в ожидание") };
  }

  if (nextStatus === "confirmed" && !canConfirmBooking(current)) {
    return { data: null, error: new Error("Подтвердить можно только бронь в ожидании") };
  }

  if (nextStatus === "completed" && !canCompleteBooking({
    ...current,
    eventDate: current.venue_posts?.event_date ?? current.venue_posts?.deadline,
    eventTime: current.venue_posts?.start_time,
    postType: current.venue_posts?.post_type,
  })) {
    return { data: null, error: new Error("Завершить бронь можно только после даты события") };
  }

  if (nextStatus === "cancelled" && !canCancelBooking(current)) {
    return { data: null, error: new Error("Эту бронь уже нельзя отменить") };
  }

  const { data, error } = await supabase
    .from("bookings")
    .update({
      status: nextStatus,
      ...getBookingStatusTimestampPatch(nextStatus),
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (!error && data && nextStatus === "confirmed" && data.post_id) {
    await markVenuePostSelected(data.post_id);
  }

  return { data, error };
}
