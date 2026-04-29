import { useEffect, useRef, useState } from "react";
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
import { supabase } from "@/integrations/supabase/client";

export type BookingRow = Tables<"bookings">;
type VenuePost = Tables<"venue_posts">;

const CACHE_TTL = 90_000;
const API_URL = import.meta.env.VITE_API_URL;
const REQUEST_TIMEOUT_MS = 3000;
const POLL_INTERVAL_MS = 15000;
const FETCH_COOLDOWN_MS = 4000;
const INITIAL_INTERVAL_DELAY_MS = 4000;

async function getAuthHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

function isUniqueViolation(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === "23505" || (error?.message?.toLowerCase() ?? "").includes("duplicate");
}

async function fetchJson<T>(url: string, init: RequestInit | undefined, fallback: T): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

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
      console.error("Bookings API request failed", {
        url,
        method: init?.method ?? "GET",
        status: response.status,
        error: payload?.error ?? null,
        body: init?.body ?? null,
      });
      return fallback;
    }

    return payload?.data ?? fallback;
  } catch (error) {
    console.error("Bookings API request error", {
      url,
      method: init?.method ?? "GET",
      error,
      body: init?.body ?? null,
    });
    return fallback;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function fetchJsonWithStatus<T>(url: string, init: RequestInit | undefined, fallback: T): Promise<{ ok: boolean; data: T }> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

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
      console.error("Bookings API request failed", {
        url,
        method: init?.method ?? "GET",
        status: response.status,
        error: payload?.error ?? null,
        body: init?.body ?? null,
      });
      return { ok: false, data: fallback };
    }

    return { ok: true, data: payload?.data ?? fallback };
  } catch (error) {
    console.error("Bookings API request error", {
      url,
      method: init?.method ?? "GET",
      error,
      body: init?.body ?? null,
    });
    return { ok: false, data: fallback };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function toQuery(params: Record<string, string | number | undefined>) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, String(value));
    }
  });
  const query = searchParams.toString();
  return query ? `?${query}` : "";
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
  const data = await fetchJson<BookingRow[]>(
    `${API_URL}/api/bookings${toQuery({ applicationId })}`,
    undefined,
    [],
  );
  return { data: data[0] ?? null, error: null };
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

  const applicationList = await fetchJson<any[]>(
    `${API_URL}/api/applications${toQuery({ id: applicationId })}`,
    undefined,
    [],
  );
  const application = applicationList[0] ?? null;

  if (!application) {
    return {
      data: null,
      error: new Error("Отклик не найден, бронь не создана"),
      alreadyExists: false,
    };
  }

  const source = application as Pick<GigApplication, "id" | "dj_id" | "post_id" | "status"> & {
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

  const inserted = await fetchJson<BookingRow | null>(
    `${API_URL}/api/bookings`,
    {
      method: "POST",
      body: JSON.stringify(booking),
    },
    null,
  );

  if (!inserted) {
    const retry = await getBookingForApplication(applicationId);
    return {
      data: retry.data,
      error: retry.error ?? (retry.data ? null : new Error("Не удалось создать бронь")),
      alreadyExists: !!retry.data,
    };
  }

  return { data: inserted, error: null, alreadyExists: false };
}

async function markVenuePostSelected(postId: string) {
  const data = await fetchJson<VenuePost | null>(
    `${API_URL}/api/venue-posts/${postId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ status: "closed" }),
    },
    null,
  );

  if (data) {
    syncVenuePostCaches(data);
    setCachedValue(`post:${postId}`, data, CACHE_TTL);
  }
}

export function useBookingsForParticipant(profileId: string | undefined, kind: "dj" | "venue") {
  const [bookings, setBookings] = useState<(BookingRow & { venue_posts?: Pick<VenuePost, "event_date" | "title"> | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const lastFetchAtRef = useRef(0);
  const inFlightPromiseRef = useRef<Promise<void> | null>(null);
  const bookingsRef = useRef<(BookingRow & { venue_posts?: Pick<VenuePost, "event_date" | "title"> | null })[]>([]);

  useEffect(() => {
    bookingsRef.current = bookings;
  }, [bookings]);

  const fetch = async (opts?: { silent?: boolean }) => {
    if (!profileId) {
      setBookings([]);
      setError(null);
      setLoading(false);
      return;
    }

    const now = Date.now();
    if (inFlightRef.current) return inFlightPromiseRef.current ?? Promise.resolve();
    if (now - lastFetchAtRef.current < FETCH_COOLDOWN_MS) return;

    const request = (async () => {
      if (!opts?.silent && bookingsRef.current.length === 0) setLoading(true);
      inFlightRef.current = true;
      lastFetchAtRef.current = now;

      try {
        const result = await fetchJsonWithStatus<(BookingRow & { venue_posts?: Pick<VenuePost, "event_date" | "title"> | null })[]>(
          `${API_URL}/api/bookings${toQuery(kind === "dj" ? { djId: profileId } : { venueId: profileId })}`,
          undefined,
          bookingsRef.current,
        );

        if (!result.ok) {
          setError("Не удалось загрузить бронирования");
          return;
        }

        setError(null);
        setBookings(result.data ?? []);
      } finally {
        inFlightRef.current = false;
        inFlightPromiseRef.current = null;
        if (!opts?.silent) setLoading(false);
      }
    })();

    inFlightPromiseRef.current = request;
    return request;
  };

  useEffect(() => {
    void fetch();
    if (!profileId) return;

    const timeoutId = window.setTimeout(() => {
      void fetch({ silent: true });
    }, INITIAL_INTERVAL_DELAY_MS);

    const intervalId = window.setInterval(() => {
      void fetch({ silent: true });
    }, POLL_INTERVAL_MS + INITIAL_INTERVAL_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [profileId, kind]);

  const updateBookingLocal = (bookingId: string, updates: Partial<BookingRow>) => {
    setBookings((current) => current.map((booking) => (
      booking.id === bookingId ? { ...booking, ...updates } : booking
    )));
  };

  return { bookings, loading, error, refetch: fetch, updateBookingLocal };
}

export async function updateBookingStatus(id: string, status: BookingStatus) {
  const nextStatus = normalizeBookingStatus(status);
  const bookingList = await fetchJson<any[]>(
    `${API_URL}/api/bookings${toQuery({ id })}`,
    undefined,
    [],
  );
  const booking = bookingList[0] ?? null;

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

  const data = await fetchJson<BookingRow | null>(
    `${API_URL}/api/bookings/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        status: nextStatus,
        ...getBookingStatusTimestampPatch(nextStatus),
      }),
    },
    null,
  );

  if (data && nextStatus === "confirmed" && data.post_id) {
    await markVenuePostSelected(data.post_id);
  }

  return { data, error: data ? null : new Error("Не удалось обновить бронь") };
}
