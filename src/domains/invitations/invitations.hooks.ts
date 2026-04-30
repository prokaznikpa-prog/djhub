import { useEffect, useRef, useState } from "react";
import type { Tables } from "@/integrations/supabase/types";
import type { ChatThread } from "@/lib/chat";
import { ensureChatThreadForBooking } from "@/lib/chatFlow";
import { type Gig, isOpenGig } from "@/lib/gigs";
import { cachedRequest, getCacheSnapshot, setCachedValue } from "@/lib/requestCache";
import { isApplicationAccepted } from "@/domains/applications/applications.rules";
import {
  getActiveInvitationForDjAndGig,
  getApplicationForDjAndGig,
  getVenuePostSelection,
  updateApplicationStatus,
} from "@/domains/applications/applications.hooks";
import { createBookingForAcceptedApplication } from "@/domains/bookings/bookings.hooks";
import {
  canInteractWithPost,
  getPostModerationState,
  type VenuePost,
} from "@/domains/posts/posts.hooks";
import { supabase } from "@/integrations/supabase/client";

export type InvitationRow = Tables<"invitations">;

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
  return error?.code === "23505" || error?.message?.toLowerCase().includes("duplicate");
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
      console.error("Invitations API request failed", {
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
    console.error("Invitations API request error", {
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
      console.error("Invitations API request failed", {
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
    console.error("Invitations API request error", {
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

export function useInvitationsForDj(djId: string | undefined) {
  type DjInvitation = InvitationRow & { venue_posts: VenuePost | null; venue_profiles: Tables<"venue_profiles"> | null };
  const cacheKey = `invitations-dj:${djId ?? "none"}`;
  const cacheSnapshot = getCacheSnapshot<DjInvitation[]>(cacheKey);
  const [invites, setInvites] = useState<DjInvitation[]>(() => cacheSnapshot.value ?? []);
  const [loading, setLoading] = useState(() => !cacheSnapshot.value);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const lastFetchAtRef = useRef(0);
  const inFlightPromiseRef = useRef<Promise<void> | null>(null);
  const requestIdRef = useRef(0);
  const invitesRef = useRef<DjInvitation[]>(cacheSnapshot.value ?? []);

  useEffect(() => {
    invitesRef.current = invites;
  }, [invites]);

  const fetch = async (opts?: { force?: boolean; silent?: boolean }) => {
    const currentRequestId = ++requestIdRef.current;
    if (!djId) {
      setInvites([]);
      setLoading(false);
      setError(null);
      return;
    }
    const now = Date.now();
    if (inFlightRef.current) return inFlightPromiseRef.current ?? Promise.resolve();
    if (now - lastFetchAtRef.current < FETCH_COOLDOWN_MS) return;

    const request = (async () => {
      if (!opts?.silent && invitesRef.current.length === 0) setLoading(true);
      inFlightRef.current = true;
      lastFetchAtRef.current = now;

      try {
        const loader = async () => fetchJsonWithStatus<DjInvitation[]>(
          `${API_URL}/api/invitations${toQuery({ djId })}`,
          undefined,
          invitesRef.current,
        );

        const data = await loader();
        if (currentRequestId !== requestIdRef.current) return;
        if (!data.ok) {
          setError("Не удалось загрузить приглашения");
          return;
        }

        setError(null);
        setCachedValue(cacheKey, data.data, CACHE_TTL);
        setInvites(data.data);
      } finally {
        inFlightRef.current = false;
        inFlightPromiseRef.current = null;
        if (currentRequestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    })();

    inFlightPromiseRef.current = request;
    return request;
  };

  useEffect(() => {
    const snapshot = getCacheSnapshot<DjInvitation[]>(cacheKey);
    const shouldFetchOnMount = !(snapshot.exists && !snapshot.isStale);
    if (snapshot.value) {
      setInvites(snapshot.value);
      setLoading(false);
      setError(null);
    } else {
      setInvites([]);
      setLoading(true);
    }

    if (shouldFetchOnMount) {
      if (snapshot.value) void fetch({ force: true, silent: true });
      else void fetch();
    }

    if (!djId) return;

    let intervalId: number | null = null;
    const timeoutId = window.setTimeout(() => {
      void fetch({ force: true, silent: true });
      intervalId = window.setInterval(() => {
        void fetch({ force: true, silent: true });
      }, POLL_INTERVAL_MS);
    }, shouldFetchOnMount ? POLL_INTERVAL_MS : INITIAL_INTERVAL_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [cacheKey, djId]);

  const updateLocal = (invitationId: string, status: InvitationRow["status"]) => {
    setInvites((current) => {
      const next = current.map((invitation) => invitation.id === invitationId ? { ...invitation, status } : invitation);
      setCachedValue(cacheKey, next, CACHE_TTL);
      return next;
    });
  };

  return { invites, loading, error, refetch: fetch, updateLocal };
}

export function useInvitationsForVenue(venueId: string | undefined) {
  type VenueInvitation = InvitationRow & { dj_profiles: Tables<"dj_profiles"> | null; venue_posts: VenuePost | null };
  const cacheKey = `invitations-venue:${venueId ?? "none"}`;
  const cacheSnapshot = getCacheSnapshot<VenueInvitation[]>(cacheKey);
  const [invites, setInvites] = useState<VenueInvitation[]>(() => cacheSnapshot.value ?? []);
  const [loading, setLoading] = useState(() => !cacheSnapshot.value);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const lastFetchAtRef = useRef(0);
  const inFlightPromiseRef = useRef<Promise<void> | null>(null);
  const requestIdRef = useRef(0);
  const invitesRef = useRef<VenueInvitation[]>(cacheSnapshot.value ?? []);

  useEffect(() => {
    invitesRef.current = invites;
  }, [invites]);

  const fetch = async (opts?: { force?: boolean; silent?: boolean }) => {
    const currentRequestId = ++requestIdRef.current;
    if (!venueId) {
      setInvites([]);
      setLoading(false);
      setError(null);
      return;
    }
    const now = Date.now();
    if (inFlightRef.current) return inFlightPromiseRef.current ?? Promise.resolve();
    if (now - lastFetchAtRef.current < FETCH_COOLDOWN_MS) return;

    const request = (async () => {
      if (!opts?.silent && invitesRef.current.length === 0) setLoading(true);
      inFlightRef.current = true;
      lastFetchAtRef.current = now;

      try {
        const loader = async () => fetchJsonWithStatus<VenueInvitation[]>(
          `${API_URL}/api/invitations${toQuery({ venueId })}`,
          undefined,
          invitesRef.current,
        );

        const data = await loader();
        if (currentRequestId !== requestIdRef.current) return;
        if (!data.ok) {
          setError("Не удалось загрузить приглашения");
          return;
        }

        setError(null);
        setCachedValue(cacheKey, data.data, CACHE_TTL);
        setInvites(data.data);
      } finally {
        inFlightRef.current = false;
        inFlightPromiseRef.current = null;
        if (currentRequestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    })();

    inFlightPromiseRef.current = request;
    return request;
  };

  useEffect(() => {
    const snapshot = getCacheSnapshot<VenueInvitation[]>(cacheKey);
    const shouldFetchOnMount = !(snapshot.exists && !snapshot.isStale);
    if (snapshot.value) {
      setInvites(snapshot.value);
      setLoading(false);
      setError(null);
    } else {
      setInvites([]);
      setLoading(true);
    }

    if (shouldFetchOnMount) {
      if (snapshot.value) void fetch({ force: true, silent: true });
      else void fetch();
    }

    if (!venueId) return;

    let intervalId: number | null = null;
    const timeoutId = window.setTimeout(() => {
      void fetch({ force: true, silent: true });
      intervalId = window.setInterval(() => {
        void fetch({ force: true, silent: true });
      }, POLL_INTERVAL_MS);
    }, shouldFetchOnMount ? POLL_INTERVAL_MS : INITIAL_INTERVAL_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [cacheKey, venueId]);

  const updateLocal = (invitationId: string, status: InvitationRow["status"]) => {
    setInvites((current) => {
      const next = current.map((invitation) => invitation.id === invitationId ? { ...invitation, status } : invitation);
      setCachedValue(cacheKey, next, CACHE_TTL);
      return next;
    });
  };

  return { invites, loading, error, refetch: fetch, updateLocal };
}

export async function createInvitation(venueId: string, djId: string, postId: string, message?: string) {
  const [venueCheck, djCheck] = await Promise.all([
    fetchJson<any | null>(`${API_URL}/api/venues/${venueId}`, undefined, null),
    fetchJson<any | null>(`${API_URL}/api/djs/${djId}`, undefined, null),
  ]);

  if (!venueCheck) return { data: null, error: new Error("Профиль заведения недоступен") };
  if (!djCheck) return { data: null, error: new Error("Профиль DJ недоступен") };
  if (venueCheck.status !== "active") return { data: null, error: new Error("Профиль заведения ограничен модератором") };
  if (djCheck.status !== "active") return { data: null, error: new Error("Профиль DJ ограничен модератором") };

  const { data: gig, error: gigError } = await getPostModerationState(postId);
  if (gigError) return { data: null, error: gigError };
  if (!gig) return { data: null, error: new Error("Публикация не найдена") };
  if (gig.venue_id !== venueId) return { data: null, error: new Error("Нельзя отправить приглашение от чужой публикации") };
  if (!isOpenGig(gig as Pick<Gig, "status">)) return { data: null, error: new Error("Эта публикация уже закрыта") };

  const interaction = canInteractWithPost(gig);
  if (!interaction.allowed) {
    return { data: null, error: new Error(interaction.reason ?? "Публикация недоступна") };
  }

  const currentRound = ((gig as { application_round?: number | null }).application_round ?? 1);
  const selection = await getVenuePostSelection(postId);
  if (selection.error) return { data: null, error: selection.error };
  if (selection.isSelected) return { data: null, error: new Error("На эту публикацию уже выбран DJ") };

  const [applicationConflict, invitationConflict] = await Promise.all([
    getApplicationForDjAndGig(djId, postId, currentRound),
    getActiveInvitationForDjAndGig(djId, postId, currentRound),
  ]);

  if (applicationConflict.error) return { data: null, error: applicationConflict.error };
  if (invitationConflict.error) return { data: null, error: invitationConflict.error };
  if (applicationConflict.data) return { data: null, error: new Error("Для этой публикации уже есть отклик от этого DJ") };
  if (invitationConflict.data) return { data: null, error: new Error("Приглашение уже отправлено") };

  const data = await fetchJson<InvitationRow | null>(
    `${API_URL}/api/invitations`,
    {
      method: "POST",
      body: JSON.stringify({ venue_id: venueId, dj_id: djId, post_id: postId, message, application_round: currentRound }),
    },
    null,
  );

  return { data, error: data ? null : new Error("Не удалось отправить приглашение") };
}

async function ensureAcceptedApplicationForInvitation(invitation: InvitationRow) {
  const existing = await getApplicationForDjAndGig(invitation.dj_id, invitation.post_id, invitation.application_round);
  if (existing.error) return { data: null, error: existing.error };

  if (existing.data) {
    if (isApplicationAccepted(existing.data.status)) return { data: existing.data, error: null };
    const updated = await updateApplicationStatus(existing.data.id, "accepted");
    return { data: updated.data, error: updated.error, chatThread: updated.chatThread };
  }

  const data = await fetchJson<any | null>(
    `${API_URL}/api/applications`,
    {
      method: "POST",
      body: JSON.stringify({
        dj_id: invitation.dj_id,
        post_id: invitation.post_id,
        message: invitation.message,
        application_round: invitation.application_round,
        status: "accepted",
      }),
    },
    null,
  );

  if (!data) {
    const retry = await getApplicationForDjAndGig(invitation.dj_id, invitation.post_id, invitation.application_round);
    if (retry.data || retry.error) return { data: retry.data, error: retry.error };
    return { data: null, error: new Error("Не удалось создать отклик") };
  }

  return { data, error: null };
}

export async function updateInvitationStatus(id: string, status: "new" | "accepted" | "rejected" | "cancelled"): Promise<{
  error: Error | null;
  chatThread?: ChatThread | null;
}> {
  const currentList = await fetchJson<InvitationRow[]>(
    `${API_URL}/api/invitations${toQuery({ id })}`,
    undefined,
    [],
  );
  const current = currentList[0] ?? null;

  if (!current) return { error: new Error("Приглашение не найдено") };

  if (status !== "accepted") {
    const data = await fetchJson<any | null>(
      `${API_URL}/api/invitations/${id}`,
      { method: "PATCH", body: JSON.stringify({ status }) },
      null,
    );
    return { error: data ? null : new Error("Не удалось обновить приглашение") };
  }

  const { data: gig, error: gigError } = await getPostModerationState(current.post_id);
  if (gigError) return { error: gigError };

  const interaction = canInteractWithPost(gig);
  if (!interaction.allowed) {
    return { error: new Error(interaction.reason ?? "Публикация недоступна") };
  }

  const cleared = await fetchJson<any | null>(
    `${API_URL}/api/invitations/${id}`,
    { method: "PATCH", body: JSON.stringify({ status: "cancelled" }) },
    null,
  );
  if (!cleared) return { error: new Error("Не удалось обновить приглашение") };

  const application = await ensureAcceptedApplicationForInvitation(current);
  if (application.error || !application.data) {
    await fetchJson(`${API_URL}/api/invitations/${id}`, { method: "PATCH", body: JSON.stringify({ status: current.status }) }, null);
    return { error: application.error ?? new Error("Не удалось создать отклик по приглашению") };
  }

  const applicationId = application.data.id;
  const booking = await createBookingForAcceptedApplication(applicationId);
  if (booking.error) {
    await fetchJson(`${API_URL}/api/invitations/${id}`, { method: "PATCH", body: JSON.stringify({ status: current.status }) }, null);
    return { error: booking.error };
  }
  if (!booking.data) {
    await fetchJson(`${API_URL}/api/invitations/${id}`, { method: "PATCH", body: JSON.stringify({ status: current.status }) }, null);
    return { error: new Error("Бронь не создана") };
  }

  const thread = await ensureChatThreadForBooking(booking.data.id);
  if (thread.error) {
    await fetchJson(`${API_URL}/api/invitations/${id}`, { method: "PATCH", body: JSON.stringify({ status: current.status }) }, null);
    return { error: thread.error };
  }

  const updated = await fetchJson<any | null>(
    `${API_URL}/api/invitations/${id}`,
    { method: "PATCH", body: JSON.stringify({ status }) },
    null,
  );
  if (!updated) return { error: new Error("Не удалось обновить приглашение") };

  return { error: null, chatThread: thread.data };
}

export async function checkInvited(venueId: string, djId: string, postId: string): Promise<boolean> {
  const { data: gig } = await getPostModerationState(postId);
  const currentRound = ((gig as { application_round?: number | null } | null)?.application_round ?? 1);

  const data = await fetchJson<any[]>(
    `${API_URL}/api/invitations${toQuery({
      venueId,
      djId,
      postId,
      applicationRound: currentRound,
      status: "new,accepted",
    })}`,
    undefined,
    [],
  );

  return data.length > 0;
}
