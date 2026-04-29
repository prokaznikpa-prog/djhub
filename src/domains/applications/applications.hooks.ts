import { useEffect, useMemo, useRef, useState } from "react";
import {
  type Gig,
  type GigApplication,
  type GigApplicationForVenue,
  type GigApplicationWithDj,
  type GigApplicationWithGig,
  isOpenGig,
  toApplicationInsert,
} from "@/lib/gigs";
import type { ChatThread } from "@/lib/chat";
import { ensureChatThreadForBooking } from "@/lib/chatFlow";
import { cachedRequest, getCachedValue, getCacheSnapshot, setCachedValue } from "@/lib/requestCache";
import { canInteractWithPost } from "@/domains/posts/posts.rules";
import { shouldCreateBookingForStatusTransition } from "@/domains/bookings/bookings.rules";
import {
  createBookingForAcceptedApplication,
  type BookingRow,
} from "@/domains/bookings/bookings.hooks";
import {
  type ApplicationActor,
  type ApplicationLocalPatch,
  type ApplicationStatusInput,
  type ApplicationVisibility,
  createApplicationCollection,
  getApplicationVisibilityPatch,
  isApplicationAccepted,
  patchApplicationStatusLocally,
  toApplicationDbStatus,
  updateApplicationInCollection,
} from "@/domains/applications/applications.rules";
import { supabase } from "@/integrations/supabase/client";

export type AppRow = GigApplication;

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
      console.error("Applications API request failed", {
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
    console.error("Applications API request error", {
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
      console.error("Applications API request failed", {
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
    console.error("Applications API request error", {
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

async function getPostModerationState(postId: string) {
  const data = await fetchJson<any[]>(
    `${API_URL}/api/venue-posts${toQuery({ id: postId })}`,
    undefined,
    [],
  );

  const post = data[0] ?? null;
  if (!post) return { data: null, error: null };

  return {
    data: {
      ...post,
      moderation_status: post.moderation_status ?? "active",
    },
    error: null,
  };
}

async function getVenuePostCurrentRound(postId: string) {
  const data = await fetchJson<any[]>(
    `${API_URL}/api/venue-posts${toQuery({ id: postId })}`,
    undefined,
    [],
  );

  const post = data[0] ?? null;
  return {
    data: post,
    error: null,
    round: ((post as { application_round?: number | null } | null)?.application_round ?? 1),
  };
}

export async function getVenuePostSelection(postId: string) {
  const currentPost = await getVenuePostCurrentRound(postId);
  if (currentPost.error) return { error: currentPost.error, isSelected: false };

  const bookings = await fetchJson<any[]>(
    `${API_URL}/api/bookings${toQuery({
      postId,
      status: "confirmed",
      applicationRound: currentPost.round,
    })}`,
    undefined,
    [],
  );

  return {
    error: null,
    isSelected: bookings.length > 0,
  };
}

export function useApplicationsForPost(postId: string | undefined) {
  const [apps, setApps] = useState<GigApplicationWithDj[]>([]);

  const fetch = async () => {
    if (!postId) return;
    const data = await fetchJson<GigApplicationWithDj[]>(
      `${API_URL}/api/applications${toQuery({ postId })}`,
      undefined,
      [],
    );
    setApps(data);
  };

  useEffect(() => {
    void fetch();
  }, [postId]);

  return { apps, refetch: fetch };
}

export function useApplicationsForDj(djId: string | undefined, visibility: ApplicationVisibility = "active") {
  const cacheKey = `applications-dj:${djId ?? "none"}`;
  const cacheSnapshot = getCacheSnapshot<GigApplicationWithGig[]>(cacheKey);
  const [allApps, setAllApps] = useState<GigApplicationWithGig[]>(() => cacheSnapshot.value ?? []);
  const [loading, setLoading] = useState(() => !cacheSnapshot.value);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const lastFetchAtRef = useRef(0);
  const inFlightPromiseRef = useRef<Promise<void> | null>(null);
  const appsRef = useRef<GigApplicationWithGig[]>(cacheSnapshot.value ?? []);

  useEffect(() => {
    appsRef.current = allApps;
  }, [allApps]);

  const fetch = async (opts?: { silent?: boolean; force?: boolean }) => {
    if (!djId) {
      setAllApps([]);
      setLoading(false);
      return;
    }

    const now = Date.now();
    if (inFlightRef.current) return inFlightPromiseRef.current ?? Promise.resolve();
    if (now - lastFetchAtRef.current < FETCH_COOLDOWN_MS) return;

    const request = (async () => {
      if (!opts?.silent && appsRef.current.length === 0) setLoading(true);
      inFlightRef.current = true;
      lastFetchAtRef.current = now;

      try {
        const loader = async () => fetchJsonWithStatus<GigApplicationWithGig[]>(
          `${API_URL}/api/applications${toQuery({ djId })}`,
          undefined,
          appsRef.current,
        );

        const data = await loader();
        if (!data.ok) {
          setError("Не удалось загрузить отклики");
          return;
        }

        setError(null);
        setCachedValue(cacheKey, data.data, CACHE_TTL);
        setAllApps(data.data);
      } catch (error) {
        console.error("Failed to load DJ applications", error);
        setError("Не удалось загрузить отклики");
      } finally {
        inFlightRef.current = false;
        inFlightPromiseRef.current = null;
        setLoading(false);
      }
    })();

    inFlightPromiseRef.current = request;
    return request;
  };

  useEffect(() => {
    const snapshot = getCacheSnapshot<GigApplicationWithGig[]>(cacheKey);

    if (snapshot.value) {
      setAllApps(snapshot.value);
      setError(null);
      setLoading(false);
    } else {
      setAllApps([]);
      setLoading(true);
    }

    if (!djId) return;

    if (!(snapshot.exists && !snapshot.isStale)) {
      if (snapshot.value) {
        void fetch({ silent: true, force: true });
      } else {
        void fetch();
      }
    }

    const timeoutId = window.setTimeout(() => {
      void fetch({ silent: true, force: true });
    }, INITIAL_INTERVAL_DELAY_MS);

    const intervalId = window.setInterval(() => {
      void fetch({ silent: true, force: true });
    }, POLL_INTERVAL_MS + INITIAL_INTERVAL_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [cacheKey, djId]);

  const collection = useMemo(() => createApplicationCollection(allApps, "dj", visibility), [allApps, visibility]);

  const hideLocal = (applicationId: string) => {
    setAllApps((current) => {
      const next = updateApplicationInCollection(current, applicationId, getApplicationVisibilityPatch("dj", visibility === "active"));
      setCachedValue(cacheKey, next, CACHE_TTL);
      return next;
    });
  };

  const updateLocal = (applicationId: string, updates: ApplicationLocalPatch) => {
    setAllApps((current) => {
      const next = updateApplicationInCollection(current, applicationId, updates);
      setCachedValue(cacheKey, next, CACHE_TTL);
      return next;
    });
  };

  const updateStatusLocal = (applicationId: string, status: ApplicationStatusInput) => {
    setAllApps((current) => {
      const next = patchApplicationStatusLocally(current, applicationId, status);
      setCachedValue(cacheKey, next, CACHE_TTL);
      return next;
    });
  };

  return { apps: collection.current, collection, loading, error, refetch: fetch, hideLocal, updateLocal, updateStatusLocal };
}

export function useApplicationsForVenue(venueId: string | undefined, visibility: ApplicationVisibility = "active") {
  const cacheKey = `applications-venue:${venueId ?? "none"}`;
  const cacheSnapshot = getCacheSnapshot<GigApplicationForVenue[]>(cacheKey);
  const [allApps, setAllApps] = useState<GigApplicationForVenue[]>(() => cacheSnapshot.value ?? []);
  const [loading, setLoading] = useState(() => !cacheSnapshot.value);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const lastFetchAtRef = useRef(0);
  const inFlightPromiseRef = useRef<Promise<void> | null>(null);
  const appsRef = useRef<GigApplicationForVenue[]>(cacheSnapshot.value ?? []);

  useEffect(() => {
    appsRef.current = allApps;
  }, [allApps]);

  const fetch = async (opts?: { silent?: boolean; force?: boolean }) => {
    if (!venueId) {
      setAllApps([]);
      setLoading(false);
      return;
    }

    const now = Date.now();
    if (inFlightRef.current) return inFlightPromiseRef.current ?? Promise.resolve();
    if (now - lastFetchAtRef.current < FETCH_COOLDOWN_MS) return;

    const request = (async () => {
      if (!opts?.silent && appsRef.current.length === 0) setLoading(true);
      inFlightRef.current = true;
      lastFetchAtRef.current = now;

      try {
        const loader = async () => fetchJsonWithStatus<GigApplicationForVenue[]>(
          `${API_URL}/api/applications${toQuery({ venueId })}`,
          undefined,
          appsRef.current,
        );

        const data = await loader();
        if (!data.ok) {
          setError("Не удалось загрузить отклики");
          return;
        }

        setError(null);
        setCachedValue(cacheKey, data.data, CACHE_TTL);
        setAllApps(data.data);
      } catch (error) {
        console.error("Failed to load venue applications", error);
        setError("Не удалось загрузить отклики");
      } finally {
        inFlightRef.current = false;
        inFlightPromiseRef.current = null;
        setLoading(false);
      }
    })();

    inFlightPromiseRef.current = request;
    return request;
  };

  useEffect(() => {
    const snapshot = getCacheSnapshot<GigApplicationForVenue[]>(cacheKey);

    if (snapshot.value) {
      setAllApps(snapshot.value);
      setError(null);
      setLoading(false);
    } else {
      setAllApps([]);
      setLoading(true);
    }

    if (!venueId) return;

    if (!(snapshot.exists && !snapshot.isStale)) {
      if (snapshot.value) {
        void fetch({ silent: true, force: true });
      } else {
        void fetch();
      }
    }

    const timeoutId = window.setTimeout(() => {
      void fetch({ silent: true, force: true });
    }, INITIAL_INTERVAL_DELAY_MS);

    const intervalId = window.setInterval(() => {
      void fetch({ silent: true, force: true });
    }, POLL_INTERVAL_MS + INITIAL_INTERVAL_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [cacheKey, venueId]);

  const collection = useMemo(() => createApplicationCollection(allApps, "venue", visibility), [allApps, visibility]);

  const hideLocal = (applicationId: string) => {
    setAllApps((current) => {
      const next = updateApplicationInCollection(current, applicationId, getApplicationVisibilityPatch("venue", visibility === "active"));
      setCachedValue(cacheKey, next, CACHE_TTL);
      return next;
    });
  };

  const updateLocal = (applicationId: string, updates: ApplicationLocalPatch) => {
    setAllApps((current) => {
      const next = updateApplicationInCollection(current, applicationId, updates);
      setCachedValue(cacheKey, next, CACHE_TTL);
      return next;
    });
  };

  const updateStatusLocal = (applicationId: string, status: ApplicationStatusInput) => {
    setAllApps((current) => {
      const next = patchApplicationStatusLocally(current, applicationId, status);
      setCachedValue(cacheKey, next, CACHE_TTL);
      return next;
    });
  };

  return { apps: collection.current, collection, loading, error, refetch: fetch, hideLocal, updateLocal, updateStatusLocal };
}

export async function createApplication(djId: string, postId: string, message?: string) {
  const dj = await fetchJson<any | null>(`${API_URL}/api/djs/${djId}`, undefined, null);
  if (!dj) return { data: null, error: new Error("Профиль DJ недоступен"), alreadyApplied: false };
  if (dj.status !== "active") {
    return { data: null, error: new Error("Профиль DJ ограничен модератором"), alreadyApplied: false };
  }

  const { data: gig, error: gigError } = await getPostModerationState(postId);
  if (gigError) return { data: null, error: gigError, alreadyApplied: false };
  if (gig && !isOpenGig(gig as Pick<Gig, "status">)) {
    return { data: null, error: new Error("Эта публикация уже закрыта"), alreadyApplied: false };
  }

  const interaction = canInteractWithPost(gig);
  if (!interaction.allowed) {
    return { data: null, error: new Error(interaction.reason ?? "Публикация недоступна"), alreadyApplied: false };
  }

  const selection = await getVenuePostSelection(postId);
  if (selection.error) return { data: null, error: selection.error, alreadyApplied: false };
  if (selection.isSelected) {
    return { data: null, error: new Error("На эту публикацию уже выбран DJ"), alreadyApplied: false };
  }

  const currentRound = ((gig as { application_round?: number | null } | null)?.application_round ?? 1);
  const existing = await getApplicationForDjAndGig(djId, postId, currentRound);
  if (existing.data) {
    return { data: existing.data, error: null, alreadyApplied: true };
  }

  const invitationConflict = await getActiveInvitationForDjAndGig(djId, postId, currentRound);
  if (invitationConflict.data) {
    return { data: null, error: new Error("Для этой публикации уже есть активное приглашение"), alreadyApplied: false };
  }
  if (invitationConflict.error) return { data: null, error: invitationConflict.error, alreadyApplied: false };

  const data = await fetchJson<GigApplicationWithGig | null>(
    `${API_URL}/api/applications`,
    {
      method: "POST",
      body: JSON.stringify({ ...toApplicationInsert({ djId, gigId: postId, message }), application_round: currentRound }),
    },
    null,
  );

  if (data) {
    const djCacheKey = `applications-dj:${djId}`;
    const currentDj = getCachedValue<GigApplicationWithGig[]>(djCacheKey, { allowStale: true }) ?? [];
    const nextDj = currentDj.some((application) => application.id === data.id)
      ? currentDj.map((application) => application.id === data.id ? data : application)
      : [data, ...currentDj];
    setCachedValue(djCacheKey, nextDj, CACHE_TTL);

    const venueId = (gig as { venue_id?: string | null } | null)?.venue_id ?? null;
    if (venueId) {
      const venueCacheKey = `applications-venue:${venueId}`;
      const currentVenue = getCachedValue<GigApplicationForVenue[]>(venueCacheKey, { allowStale: true });
      if (currentVenue) {
        const venueRow = data as unknown as GigApplicationForVenue;
        const nextVenue = currentVenue.some((application) => application.id === venueRow.id)
          ? currentVenue.map((application) => application.id === venueRow.id ? venueRow : application)
          : [venueRow, ...currentVenue];
        setCachedValue(venueCacheKey, nextVenue, CACHE_TTL);
      }
    }
  }

  return { data, error: data ? null : new Error("Не удалось создать отклик"), alreadyApplied: false };
}

export async function getApplicationForDjAndGig(djId: string, postId: string, applicationRound?: number) {
  const data = await fetchJson<any[]>(
    `${API_URL}/api/applications${toQuery({ djId, postId, applicationRound })}`,
    undefined,
    [],
  );
  return { data: data[0] ?? null, error: null };
}

export async function getActiveInvitationForDjAndGig(djId: string, postId: string, applicationRound?: number) {
  const data = await fetchJson<any[]>(
    `${API_URL}/api/invitations${toQuery({ djId, postId, applicationRound, status: "new,accepted" })}`,
    undefined,
    [],
  );
  return { data: data[0] ?? null, error: null };
}

export async function updateApplicationStatus(id: string, status: ApplicationStatusInput): Promise<{
  data: Pick<GigApplication, "id" | "status"> | null;
  error: Error | null;
  chatThread: ChatThread | null;
}> {
  const dbStatus = toApplicationDbStatus(status);
  const currentList = await fetchJson<any[]>(
    `${API_URL}/api/applications${toQuery({ id })}`,
    undefined,
    [],
  );
  const current = currentList[0] ?? null;
  if (!current) return { data: null, error: new Error("Отклик не найден или недоступен для обновления"), chatThread: null };

  const shouldCreateBooking = shouldCreateBookingForStatusTransition(current.status, dbStatus);
  if (isApplicationAccepted(dbStatus)) {
    const { data: gig, error: gigError } = await getPostModerationState((current as any).post_id);
    if (gigError) return { data: null, error: gigError, chatThread: null };

    const interaction = canInteractWithPost(gig);
    if (!interaction.allowed) {
      return { data: null, error: new Error(interaction.reason ?? "Публикация недоступна"), chatThread: null };
    }

    if (shouldCreateBooking) {
      const selection = await getVenuePostSelection((current as any).post_id);
      if (selection.error) return { data: null, error: selection.error, chatThread: null };
      if (selection.isSelected) {
        return { data: null, error: new Error("На эту публикацию уже выбран DJ"), chatThread: null };
      }
    }
  }

  const data = await fetchJson<Pick<GigApplication, "id" | "status"> | null>(
    `${API_URL}/api/applications/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify({ status: dbStatus }),
    },
    null,
  );
  if (!data) return { data: null, error: new Error("Отклик не найден или недоступен для обновления"), chatThread: null };

  let acceptedBooking: BookingRow | null = null;
  if (shouldCreateBooking) {
    const booking = await createBookingForAcceptedApplication(id);
    if (booking.error) {
      const rollback = await fetchJson<any | null>(
        `${API_URL}/api/applications/${id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: current.status }),
        },
        null,
      );

      if (!rollback) {
        return {
          data: null,
          error: new Error(`Бронь не создана: ${booking.error.message}. Не удалось вернуть статус отклика`),
          chatThread: null,
        };
      }

      return { data: null, error: booking.error, chatThread: null };
    }
    acceptedBooking = booking.data;
  }

  let chatThread: ChatThread | null = null;
  if (isApplicationAccepted(dbStatus)) {
    if (!acceptedBooking) {
      const booking = await createBookingForAcceptedApplication(id);
      if (booking.error) return { data: null, error: booking.error, chatThread: null };
      acceptedBooking = booking.data;
    }
    if (!acceptedBooking) return { data: null, error: new Error("Бронь не создана"), chatThread: null };

    const thread = await ensureChatThreadForBooking(acceptedBooking.id);
    if (thread.error) return { data: null, error: thread.error, chatThread: null };
    chatThread = thread.data;
  }

  return { data, error: null, chatThread };
}

async function updateApplicationVisibility(id: string, actor: ApplicationActor, hidden: boolean) {
  const data = await fetchJson<any | null>(
    `${API_URL}/api/applications/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(getApplicationVisibilityPatch(actor, hidden)),
    },
    null,
  );
  if (!data) return { error: new Error("Отклик не найден или недоступен для обновления") };
  return { error: null };
}

export async function hideApplicationForDj(id: string) {
  return updateApplicationVisibility(id, "dj", true);
}

export async function restoreApplicationForDj(id: string) {
  return updateApplicationVisibility(id, "dj", false);
}

export async function hideApplicationForVenue(id: string) {
  return updateApplicationVisibility(id, "venue", true);
}

export async function restoreApplicationForVenue(id: string) {
  return updateApplicationVisibility(id, "venue", false);
}

export async function checkApplied(djId: string, postId: string): Promise<boolean> {
  const current = await getVenuePostCurrentRound(postId);
  const currentRound = current.round;
  const [application, invitation] = await Promise.all([
    getApplicationForDjAndGig(djId, postId, currentRound),
    getActiveInvitationForDjAndGig(djId, postId, currentRound),
  ]);
  return !!application.data || !!invitation.data;
}
