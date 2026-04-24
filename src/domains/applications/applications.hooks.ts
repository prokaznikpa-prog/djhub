import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
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

export type AppRow = GigApplication;

const CACHE_TTL = 90_000;

function isMissingColumnError(error: { message?: string } | null | undefined, column: string) {
  return (error?.message?.toLowerCase() ?? "").includes(column.toLowerCase());
}

async function getPostModerationState(postId: string) {
  const withModeration = await supabase
    .from("venue_posts")
    .select("id, status, application_round, venue_id, moderation_status")
    .eq("id", postId)
    .maybeSingle();

  if (!withModeration.error) {
    return { data: withModeration.data as any, error: null };
  }

  if (!isMissingColumnError(withModeration.error, "moderation_status")) {
    return { data: null, error: withModeration.error };
  }

  const fallback = await supabase
    .from("venue_posts")
    .select("id, status, application_round, venue_id")
    .eq("id", postId)
    .maybeSingle();

  if (fallback.error) return { data: null, error: fallback.error };
  return { data: fallback.data ? { ...(fallback.data as any), moderation_status: "active" } : null, error: null };
}

async function getVenuePostCurrentRound(postId: string) {
  const { data, error } = await supabase
    .from("venue_posts")
    .select("application_round")
    .eq("id", postId)
    .maybeSingle();
  return { data, error, round: ((data as any)?.application_round as number | null) ?? 1 };
}

export async function getVenuePostSelection(postId: string) {
  const currentPost = await getVenuePostCurrentRound(postId);
  if (currentPost.error) return { error: currentPost.error, isSelected: false };
  const currentRound = currentPost.round;

  const bookings = await supabase
    .from("bookings")
    .select("id, applications!inner(application_round)")
    .eq("post_id", postId)
    .eq("status", "confirmed")
    .eq("applications.application_round", currentRound)
    .limit(1);

  const error = bookings.error ?? null;
  return {
    error,
    isSelected: ((bookings.data as unknown[] | null)?.length ?? 0) > 0,
  };
}

export function useApplicationsForPost(postId: string | undefined) {
  const [apps, setApps] = useState<GigApplicationWithDj[]>([]);
  const fetch = async () => {
    if (!postId) return;
    const { data } = await supabase.from("applications").select("*, dj_profiles(*)").eq("post_id", postId);
    setApps((data as any) ?? []);
  };
  useEffect(() => { fetch(); }, [postId]);
  return { apps, refetch: fetch };
}

export function useApplicationsForDj(djId: string | undefined, visibility: ApplicationVisibility = "active") {
  const cacheKey = `applications-dj:${djId ?? "none"}`;
  const cacheSnapshot = getCacheSnapshot<GigApplicationWithGig[]>(cacheKey);
  const [allApps, setAllApps] = useState<GigApplicationWithGig[]>(() => cacheSnapshot.value ?? []);
  const [loading, setLoading] = useState(() => !cacheSnapshot.value);
  const fetch = async (opts?: { silent?: boolean; force?: boolean }) => {
    if (!djId) {
      setAllApps([]);
      setLoading(false);
      return;
    }
    if (!opts?.silent && allApps.length === 0) setLoading(true);
    try {
      const request = async () => {
        const { data, error } = await supabase
          .from("applications")
          .select("*, venue_posts(id, title, post_type, event_date, deadline, start_time, venue_id, venue_profiles(id, name, user_id))")
          .eq("dj_id", djId)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return ((data as any) ?? []) as GigApplicationWithGig[];
      };
      const data = opts?.force ? await request() : await cachedRequest(cacheKey, request, CACHE_TTL);
      setCachedValue(cacheKey, data, CACHE_TTL);
      setAllApps(data);
    } catch (error) {
      console.error("Failed to load DJ applications", error);
      setAllApps([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    const snapshot = getCacheSnapshot<GigApplicationWithGig[]>(cacheKey);
    if (snapshot.value) {
      setAllApps(snapshot.value);
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

    const channel = supabase
      .channel(`applications-dj-${djId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "applications", filter: `dj_id=eq.${djId}` },
        () => { void fetch({ silent: true, force: true }); },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
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
  return { apps: collection.current, collection, loading, refetch: fetch, hideLocal, updateLocal, updateStatusLocal };
}

export function useApplicationsForVenue(venueId: string | undefined, visibility: ApplicationVisibility = "active") {
  const cacheKey = `applications-venue:${venueId ?? "none"}`;
  const cacheSnapshot = getCacheSnapshot<GigApplicationForVenue[]>(cacheKey);
  const [allApps, setAllApps] = useState<GigApplicationForVenue[]>(() => cacheSnapshot.value ?? []);
  const [loading, setLoading] = useState(() => !cacheSnapshot.value);
  const fetch = async (opts?: { silent?: boolean; force?: boolean }) => {
    if (!venueId) {
      setAllApps([]);
      setLoading(false);
      return;
    }
    if (!opts?.silent && allApps.length === 0) setLoading(true);
    try {
      const request = async () => {
        const { data, error } = await supabase
          .from("applications")
          .select("*, dj_profiles(id, name, user_id), venue_posts!inner(id, title, post_type, venue_id)")
          .eq("venue_posts.venue_id", venueId)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return ((data as any) ?? []) as GigApplicationForVenue[];
      };
      const data = opts?.force ? await request() : await cachedRequest(cacheKey, request, CACHE_TTL);
      setCachedValue(cacheKey, data, CACHE_TTL);
      setAllApps(data);
    } catch (error) {
      console.error("Failed to load venue applications", error);
      setAllApps([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    const snapshot = getCacheSnapshot<GigApplicationForVenue[]>(cacheKey);
    if (snapshot.value) {
      setAllApps(snapshot.value);
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

    const channel = supabase
      .channel(`applications-venue-${venueId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "applications" },
        () => { void fetch({ silent: true, force: true }); },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
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
  return { apps: collection.current, collection, loading, refetch: fetch, hideLocal, updateLocal, updateStatusLocal };
}

export async function createApplication(djId: string, postId: string, message?: string) {
  const { data: dj, error: djError } = await supabase
    .from("dj_profiles")
    .select("status")
    .eq("id", djId)
    .maybeSingle();
  if (djError) return { data: null, error: djError, alreadyApplied: false };
  if (dj?.status !== "active") {
    return { data: null, error: new Error("Профиль DJ ограничен модератором"), alreadyApplied: false };
  }
  const { data: gig, error: gigError } = await getPostModerationState(postId);
  if (gigError) return { data: null, error: gigError, alreadyApplied: false };
  if (gig && !isOpenGig(gig as Pick<Gig, "status">)) {
    return {
      data: null,
      error: new Error("Эта публикация уже закрыта"),
      alreadyApplied: false,
    };
  }
  const interaction = canInteractWithPost(gig);
  if (!interaction.allowed) {
    return {
      data: null,
      error: new Error(interaction.reason ?? "Публикация недоступна"),
      alreadyApplied: false,
    };
  }
  const selection = await getVenuePostSelection(postId);
  if (selection.error) return { data: null, error: selection.error, alreadyApplied: false };
  if (selection.isSelected) {
    return {
      data: null,
      error: new Error("На эту публикацию уже выбран DJ"),
      alreadyApplied: false,
    };
  }
  const currentRound = ((gig as any)?.application_round as number | null) ?? 1;
  const existing = await getApplicationForDjAndGig(djId, postId, currentRound);
  if (existing.data) {
    return { data: existing.data, error: null, alreadyApplied: true };
  }

  const invitationConflict = await getActiveInvitationForDjAndGig(djId, postId, currentRound);
  if (invitationConflict.data) {
    return {
      data: null,
      error: new Error("Для этой публикации уже есть активное приглашение"),
      alreadyApplied: false,
    };
  }
  if (invitationConflict.error) return { data: null, error: invitationConflict.error, alreadyApplied: false };

  const { data, error } = await supabase
    .from("applications")
    .insert({ ...toApplicationInsert({ djId, gigId: postId, message }), application_round: currentRound })
    .select("*, dj_profiles(id, name, user_id), venue_posts(id, title, post_type, event_date, deadline, start_time, venue_id, venue_profiles(id, name, user_id))")
    .single();

  if (!error && data) {
    const djCacheKey = `applications-dj:${djId}`;
    const currentDj = getCachedValue<GigApplicationWithGig[]>(djCacheKey, { allowStale: true }) ?? [];
    const nextDj = currentDj.some((application) => application.id === data.id)
      ? currentDj.map((application) => application.id === data.id ? data as GigApplicationWithGig : application)
      : [data as GigApplicationWithGig, ...currentDj];
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

  return { data, error, alreadyApplied: false };
}

export async function getApplicationForDjAndGig(djId: string, postId: string, applicationRound?: number) {
  let q = supabase
    .from("applications")
    .select("*")
    .eq("dj_id", djId)
    .eq("post_id", postId);
  if (applicationRound) q = q.eq("application_round", applicationRound);
  const { data, error } = await q.maybeSingle();
  return { data, error };
}

export async function getActiveInvitationForDjAndGig(djId: string, postId: string, applicationRound?: number) {
  let q = supabase
    .from("invitations")
    .select("*")
    .eq("dj_id", djId)
    .eq("post_id", postId)
    .in("status", ["new", "accepted"]);
  if (applicationRound) q = q.eq("application_round", applicationRound);
  const { data, error } = await q.limit(1).maybeSingle();
  return { data, error };
}

export async function updateApplicationStatus(id: string, status: ApplicationStatusInput): Promise<{
  data: Pick<GigApplication, "id" | "status"> | null;
  error: Error | null;
  chatThread: ChatThread | null;
}> {
  const dbStatus = toApplicationDbStatus(status);
  const { data: current, error: currentError } = await supabase
    .from("applications")
    .select("id, status, post_id")
    .eq("id", id)
    .maybeSingle();

  if (currentError) return { data: null, error: currentError, chatThread: null };
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

  const { data, error } = await supabase
    .from("applications")
    .update({ status: dbStatus })
    .eq("id", id)
    .select("id, status")
    .maybeSingle();
  if (error) return { data: null, error, chatThread: null };
  if (!data) return { data: null, error: new Error("Отклик не найден или недоступен для обновления"), chatThread: null };

  let acceptedBooking: BookingRow | null = null;
  if (shouldCreateBooking) {
    const booking = await createBookingForAcceptedApplication(id);
    if (booking.error) {
      const rollback = await supabase
        .from("applications")
        .update({ status: current.status })
        .eq("id", id);

      if (rollback.error) {
        return {
          data: null,
          error: new Error(`Бронь не создана: ${booking.error.message}. Не удалось вернуть статус отклика: ${rollback.error.message}`),
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
  const { data, error } = await supabase
    .from("applications")
    .update(getApplicationVisibilityPatch(actor, hidden))
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return { error };
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
  const { data: gig } = await supabase
    .from("venue_posts")
    .select("application_round")
    .eq("id", postId)
    .maybeSingle();
  const currentRound = ((gig as any)?.application_round as number | null) ?? 1;
  const [application, invitation] = await Promise.all([
    getApplicationForDjAndGig(djId, postId, currentRound),
    getActiveInvitationForDjAndGig(djId, postId, currentRound),
  ]);
  return !!application.data || !!invitation.data;
}
