import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import {
  type Gig,
  type GigApplication,
  type GigApplicationForVenue,
  type GigApplicationWithDj,
  type GigApplicationWithGig,
  type GigInsert,
  type GigStatus,
  type GigType,
  type GigWithVenue,
  isOpenGig,
  toApplicationInsert,
} from "@/lib/gigs";
import {
  type ApplicationActor,
  type ApplicationLocalPatch,
  type ApplicationStatusInput,
  type ApplicationVisibility,
  createApplicationCollection,
  getApplicationVisibilityPatch,
  isApplicationAccepted,
  patchApplicationStatusLocally,
  patchApplicationLocally,
  toApplicationDbStatus,
} from "@/lib/applications";
import {
  DEFAULT_BOOKING_STATUS,
  canCancelBooking,
  canCompleteBooking,
  canConfirmBooking,
  canCreateBookingFromApplication,
  canLeaveReview,
  normalizeBookingStatus,
  shouldCreateBookingForStatusTransition,
  type BookingStatus,
} from "@/lib/bookings";
import { ensureChatThreadForBooking, ensureInitialChatMessage } from "@/hooks/useChat";
import type { ChatThread } from "@/lib/chat";
import { cachedRequest, getCachedValue, patchCachedListsWhere, setCachedValue } from "@/lib/requestCache";

export type VenuePost = Gig;
export type VenuePostInsert = GigInsert;
export type AppRow = GigApplication;
export type InvitationRow = Tables<"invitations">;
export type NotificationRow = Tables<"notifications">;
export type BookingRow = Tables<"bookings">;
export type ReviewRow = {
  id: string;
  booking_id: string;
  reviewer_id: string;
  target_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
};
export type ReviewRatingSummary = {
  averageRating: number;
  count: number;
};
export type VenuePostModerationStatus = "active" | "hidden" | "archived" | "blocked";
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

export function normalizePostModerationStatus(status: string | null | undefined): VenuePostModerationStatus {
  return ["hidden", "archived", "blocked"].includes(status ?? "") ? status as VenuePostModerationStatus : "active";
}

export function getPostVisibility(post: { moderation_status?: string | null } | null | undefined) {
  const moderationStatus = normalizePostModerationStatus(post?.moderation_status);
  return {
    moderationStatus,
    publicVisible: moderationStatus === "active",
    hiddenFromPublic: moderationStatus !== "active",
    readOnly: moderationStatus === "archived" || moderationStatus === "blocked",
  };
}

export function canInteractWithPost(post: { moderation_status?: string | null } | null | undefined) {
  const { moderationStatus } = getPostVisibility(post);
  if (moderationStatus === "hidden") return { allowed: false, reason: "Публикация скрыта модератором" };
  if (moderationStatus === "archived") return { allowed: false, reason: "Публикация находится в архиве" };
  if (moderationStatus === "blocked") return { allowed: false, reason: "Публикация заблокирована модератором" };
  return { allowed: true, reason: null };
}

function parseVenuePostsFiltersKey(key: string) {
  if (!key.startsWith("venue-posts:")) return null;
  try {
    return JSON.parse(key.slice("venue-posts:".length)) as {
      city?: string;
      style?: string;
      status?: GigStatus;
      postType?: GigType;
      venueId?: string;
    };
  } catch {
    return null;
  }
}

function postMatchesVenuePostsFilters(post: VenuePost, filters: ReturnType<typeof parseVenuePostsFiltersKey>) {
  if (!filters) return false;
  if (filters.city && post.city !== filters.city) return false;
  if (filters.status && post.status !== filters.status) return false;
  if (filters.postType && post.post_type !== filters.postType) return false;
  if (filters.venueId && post.venue_id !== filters.venueId) return false;
  if (!filters.venueId && !getPostVisibility(post as any).publicVisible) return false;
  if (filters.style && !post.music_styles.includes(filters.style)) return false;
  return true;
}

function syncVenuePostCaches(post: VenuePost) {
  patchCachedListsWhere<VenuePost>(
    (key) => key.startsWith("venue-posts:") || key.startsWith("venue-posts-by-venue:"),
    (items, key) => {
      const withoutPost = items.filter((item) => item.id !== post.id);
      const shouldInclude = key.startsWith("venue-posts-by-venue:")
        ? key === `venue-posts-by-venue:${post.venue_id}`
        : postMatchesVenuePostsFilters(post, parseVenuePostsFiltersKey(key));
      return shouldInclude ? [post, ...withoutPost].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) : withoutPost;
    },
    CACHE_TTL,
  );
}

// ---- Notifications ----

export async function createNotification(userId: string, type: string, message: string, relatedId?: string) {
  return supabase.from("notifications").insert({ user_id: userId, type, message, related_id: relatedId ?? null });
}

export function useNotifications(userId: string | undefined) {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetch = async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    const items = data ?? [];
    setNotifications(items);
    setUnreadCount(items.filter((n) => !n.is_read).length);
  };

  useEffect(() => {
    fetch();
    if (!userId) return;
    // Realtime subscription
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => { fetch(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  return { notifications, unreadCount, refetch: fetch };
}

export async function markNotificationRead(id: string) {
  return supabase.from("notifications").update({ is_read: true }).eq("id", id);
}

export async function markAllNotificationsRead(userId: string) {
  return supabase.from("notifications").update({ is_read: true }).eq("user_id", userId).eq("is_read", false);
}

// ---- Venue Posts ----

export function useVenuePosts(filters?: { city?: string; style?: string; status?: GigStatus; postType?: GigType; venueId?: string }) {
  const cacheKey = `venue-posts:${JSON.stringify(filters ?? {})}`;
  const [posts, setPosts] = useState<VenuePost[]>(() => getCachedValue<VenuePost[]>(cacheKey, { allowStale: true }) ?? []);
  const [loading, setLoading] = useState(() => !getCachedValue<VenuePost[]>(cacheKey, { allowStale: true }));

  const fetch = async (opts?: { silent?: boolean; force?: boolean }) => {
    if (filters?.status === "closed" && !filters?.venueId) {
      setPosts([]);
      setCachedValue(cacheKey, [] as VenuePost[], CACHE_TTL);
      setLoading(false);
      return;
    }

    if (!opts?.silent && posts.length === 0) setLoading(true);
    const request = async () => {
      const runQuery = async (includeModerationFilter: boolean) => {
        let q = supabase.from("venue_posts").select("*").order("created_at", { ascending: false });
        if (filters?.city) q = q.eq("city", filters.city);
        if (filters?.status) q = q.eq("status", filters.status);
        if (filters?.postType) q = q.eq("post_type", filters.postType);
        if (filters?.venueId) q = q.eq("venue_id", filters.venueId);
        if (includeModerationFilter && !filters?.venueId) q = q.eq("moderation_status", "active");
        return q;
      };
      let { data, error } = await runQuery(true);
      if (error && isMissingColumnError(error, "moderation_status")) {
        const fallback = await runQuery(false);
        data = fallback.data;
        error = fallback.error;
      }
      if (error) return [];
      let result = data ?? [];
      if (filters?.style) {
        result = result.filter((p) => p.music_styles.includes(filters.style!));
      }
      return result;
    };
    const result = opts?.force ? await request() : await cachedRequest(cacheKey, request, CACHE_TTL);
    setCachedValue(cacheKey, result, CACHE_TTL);
    setPosts(result);
    setLoading(false);
  };

  useEffect(() => {
    const cached = getCachedValue<VenuePost[]>(cacheKey, { allowStale: true });
    if (cached) {
      setPosts(cached);
      setLoading(false);
      void fetch({ silent: true, force: true });
    } else {
      void fetch();
    }
  }, [cacheKey]);

  const addPost = (post: VenuePost) => {
    setPosts((current) => {
      const next = current.some((item) => item.id === post.id) ? current : [post, ...current];
      setCachedValue(cacheKey, next, CACHE_TTL);
      return next;
    });
  };
  const updatePost = (postId: string, updates: Partial<VenuePost>) => {
    setPosts((current) => {
      const next = current.map((post) => post.id === postId ? { ...post, ...updates } : post);
      setCachedValue(cacheKey, next, CACHE_TTL);
      return next;
    });
  };
  const removePost = (postId: string) => {
    setPosts((current) => {
      const next = current.filter((post) => post.id !== postId);
      setCachedValue(cacheKey, next, CACHE_TTL);
      return next;
    });
  };

  return { posts, loading, refetch: fetch, addPost, updatePost, removePost };
}

export function useVenuePostsByVenue(venueId: string | undefined) {
  const cacheKey = `venue-posts-by-venue:${venueId ?? "none"}`;
  const [posts, setPosts] = useState<VenuePost[]>(() => getCachedValue<VenuePost[]>(cacheKey, { allowStale: true }) ?? []);
  const fetch = async (opts?: { force?: boolean }) => {
    if (!venueId) return;
    const request = async () => {
      const { data } = await supabase.from("venue_posts").select("*").eq("venue_id", venueId).order("created_at", { ascending: false });
      return data ?? [];
    };
    const data = opts?.force ? await request() : await cachedRequest(cacheKey, request, CACHE_TTL);
    setCachedValue(cacheKey, data, CACHE_TTL);
    setPosts(data);
  };
  useEffect(() => {
    const cached = getCachedValue<VenuePost[]>(cacheKey, { allowStale: true });
    if (cached) {
      setPosts(cached);
      void fetch({ force: true });
    } else {
      void fetch();
    }
  }, [cacheKey]);
  const removePost = (postId: string) => setPosts((current) => {
    const next = current.filter((post) => post.id !== postId);
    setCachedValue(cacheKey, next, CACHE_TTL);
    return next;
  });
  const addPost = (post: VenuePost) => {
    setPosts((current) => {
      const next = current.some((item) => item.id === post.id) ? current : [post, ...current];
      setCachedValue(cacheKey, next, CACHE_TTL);
      return next;
    });
  };
  const updatePost = (postId: string, updates: Partial<VenuePost>) => {
    setPosts((current) => {
      const next = current.map((post) => post.id === postId ? { ...post, ...updates } : post);
      setCachedValue(cacheKey, next, CACHE_TTL);
      return next;
    });
  };
  return { posts, refetch: fetch, removePost, addPost, updatePost };
}

export async function createVenuePost(post: VenuePostInsert) {
  const { data: venue, error: venueError } = await supabase
    .from("venue_profiles")
    .select("status")
    .eq("id", post.venue_id)
    .maybeSingle();
  if (venueError) return { data: null, error: venueError };
  if (venue?.status !== "active") {
    return { data: null, error: new Error("Профиль заведения ограничен модератором") };
  }
  const { data, error } = await supabase.from("venue_posts").insert(post).select().single();
  return { data, error };
}

export async function updateVenuePost(id: string, updates: Partial<VenuePost>) {
  let nextUpdates: Record<string, unknown> = updates;
  const { data: currentPost, error: currentPostError } = await getPostModerationState(id);
  if (currentPostError) return { data: null, error: currentPostError };
  const currentVisibility = getPostVisibility(currentPost);

  if (currentVisibility.moderationStatus === "blocked") {
    return { data: null, error: new Error("Публикация заблокирована модератором") };
  }
  if (currentVisibility.moderationStatus === "archived") {
    return { data: null, error: new Error("Публикация находится в архиве") };
  }

  if (updates.status === "closed") {
    const selection = await getVenuePostSelection(id);
    if (selection.error) return { data: null, error: selection.error };
    const engagement = selection.isSelected ? { error: null, hasEngagement: false } : await getVenuePostEngagement(id);
    if (engagement.error) return { data: null, error: engagement.error };
    if (engagement.hasEngagement) {
      return {
        data: null,
        error: new Error("Публикацию с откликами, приглашениями, бронями или чатом нельзя закрыть."),
      };
    }
  }

  if (updates.status === "open") {
    const { data: current } = await supabase
      .from("venue_posts")
      .select("status, application_round")
      .eq("id", id)
      .maybeSingle();

    if ((current as any)?.status === "closed") {
      nextUpdates = {
        ...updates,
        application_round: (((current as any)?.application_round as number | null) ?? 1) + 1,
      };
    }
  }

  const { data, error } = await supabase
    .from("venue_posts")
    .update(nextUpdates as any)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) return { data: null, error };
  if (!data) return { data: null, error: new Error("Публикация не найдена или недоступна для обновления") };

  if (data) {
    const updatedPost = data as VenuePost;
    syncVenuePostCaches(updatedPost);
    setCachedValue(`post:${id}`, updatedPost, CACHE_TTL);
  }

  return { data: data as VenuePost, error: null };
}

export async function getVenuePostEngagement(id: string) {
  const currentPost = await getVenuePostCurrentRound(id);
  if (currentPost.error) return { error: currentPost.error, hasEngagement: false };
  const currentRound = currentPost.round;

  const [applications, invitations, bookings] = await Promise.all([
    supabase.from("applications").select("id", { count: "exact", head: true }).eq("post_id", id).eq("application_round", currentRound).in("status", ["new", "accepted"]),
    supabase.from("invitations").select("id", { count: "exact", head: true }).eq("post_id", id).eq("application_round", currentRound).in("status", ["new", "accepted"]),
    supabase.from("bookings").select("id, applications!inner(application_round)").eq("post_id", id).in("status", ["pending", "confirmed"]).eq("applications.application_round", currentRound).limit(1),
  ]);

  const error = applications.error ?? invitations.error ?? bookings.error ?? null;
  return {
    error,
    hasEngagement: (applications.count ?? 0) > 0 || (invitations.count ?? 0) > 0 || ((bookings.data as unknown[] | null)?.length ?? 0) > 0,
  };
}

export async function deleteVenuePost(id: string) {
  const { data: post, error: postError } = await getPostModerationState(id);

  if (postError) return { error: postError, action: "none" as const };

  if (post && post.status === "open") {
    return {
      error: new Error("Открытую публикацию нельзя удалить. Сначала закройте или архивируйте её."),
      action: "blocked" as const,
    };
  }

  const [bookings, acceptedApplications] = await Promise.all([
    supabase.from("bookings").select("id", { count: "exact", head: true }).eq("post_id", id),
    supabase.from("applications").select("id", { count: "exact", head: true }).eq("post_id", id).eq("status", "accepted"),
  ]);
  const dependencyError = bookings.error ?? acceptedApplications.error ?? null;
  if (dependencyError) return { error: dependencyError, action: "none" as const };

  if ((bookings.count ?? 0) > 0 || (acceptedApplications.count ?? 0) > 0) {
    const archived = await supabase
      .from("venue_posts" as any)
      .update({ status: "closed", moderation_status: "archived" })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (!archived.error && archived.data) {
      const updatedPost = archived.data as VenuePost;
      syncVenuePostCaches(updatedPost);
      setCachedValue(`post:${id}`, updatedPost, CACHE_TTL);
      return { error: null, action: "archived" as const };
    }
    return {
      error: archived.error ?? new Error("Нельзя удалить публикацию с историей. Архивация недоступна."),
      action: "blocked" as const,
    };
  }

  const deleted = await supabase.from("venue_posts").delete().eq("id", id).select("id").maybeSingle();

  if (!deleted.error && deleted.data) {
    patchCachedListsWhere<VenuePost>(
      (key) => key.startsWith("venue-posts:") || key.startsWith("venue-posts-by-venue:"),
      (items) => items.filter((post) => post.id !== id),
      CACHE_TTL,
    );
    return { error: null, action: "deleted" as const };
  }

  return { error: deleted.error ?? new Error("Публикация не найдена или нет доступа к удалению"), action: "none" as const };
}

// ---- Applications ----

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

function updateApplicationInCollection<TApplication extends GigApplication>(
  applications: TApplication[],
  applicationId: string,
  updates: ApplicationLocalPatch,
) {
  return patchApplicationLocally(applications, applicationId, updates);
}

export function useApplicationsForDj(djId: string | undefined, visibility: ApplicationVisibility = "active") {
  const cacheKey = `applications-dj:${djId ?? "none"}`;
  const [allApps, setAllApps] = useState<GigApplicationWithGig[]>(() => getCachedValue<GigApplicationWithGig[]>(cacheKey) ?? []);
  const [loading, setLoading] = useState(() => !getCachedValue<GigApplicationWithGig[]>(cacheKey));
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
          .select("*, venue_posts(*, venue_profiles(*))")
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
    const cached = getCachedValue<GigApplicationWithGig[]>(cacheKey);
    if (cached) {
      setAllApps(cached);
      setLoading(false);
      void fetch({ silent: true, force: true });
    } else {
      void fetch();
    }
    if (!djId) return;

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
  const [allApps, setAllApps] = useState<GigApplicationForVenue[]>(() => getCachedValue<GigApplicationForVenue[]>(cacheKey) ?? []);
  const [loading, setLoading] = useState(() => !getCachedValue<GigApplicationForVenue[]>(cacheKey));
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
          .select("*, dj_profiles(*), venue_posts!inner(*)")
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
    const cached = getCachedValue<GigApplicationForVenue[]>(cacheKey);
    if (cached) {
      setAllApps(cached);
      setLoading(false);
      void fetch({ silent: true, force: true });
    } else {
      void fetch();
    }
    if (!venueId) return;

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
    .select("*, venue_posts(*, venue_profiles(*))")
    .single();

  if (!error && data) {
    const cacheKey = `applications-dj:${djId}`;
    const current = getCachedValue<GigApplicationWithGig[]>(cacheKey) ?? [];
    const next = current.some((application) => application.id === data.id)
      ? current.map((application) => application.id === data.id ? data as GigApplicationWithGig : application)
      : [data as GigApplicationWithGig, ...current];
    setCachedValue(cacheKey, next, CACHE_TTL);
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

function isUniqueViolation(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === "23505" || error?.message?.toLowerCase().includes("duplicate");
}

export async function getBookingForApplication(applicationId: string) {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("application_id", applicationId)
    .maybeSingle();
  return { data, error };
}

export async function getBookingForParticipants(postId: string, djId: string, venueId: string) {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("post_id", postId)
    .eq("dj_id", djId)
    .eq("venue_id", venueId)
    .maybeSingle();
  return { data, error };
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

  const [acceptedApplications, bookings] = await Promise.all([
    supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("post_id", postId)
      .eq("status", "accepted")
      .eq("application_round", currentRound),
    supabase
      .from("bookings")
      .select("id, applications!inner(application_round)")
      .eq("post_id", postId)
      .neq("status", "cancelled")
      .eq("applications.application_round", currentRound)
      .limit(1),
  ]);

  const error = acceptedApplications.error ?? bookings.error ?? null;
  return {
    error,
    isSelected: (acceptedApplications.count ?? 0) > 0 || ((bookings.data as unknown[] | null)?.length ?? 0) > 0,
  };
}

export async function hasBookingForApplication(applicationId: string) {
  const { data, error } = await getBookingForApplication(applicationId);
  return { data, error, exists: !!data };
}

export async function createBookingForAcceptedApplication(applicationId: string) {
  const existing = await getBookingForApplication(applicationId);
  if (existing.error) return { data: null, error: existing.error, alreadyExists: false };
  if (existing.data) {
    await markVenuePostSelected(existing.data.post_id);
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

  const existingForParticipants = await getBookingForParticipants(source.post_id, source.dj_id, venueId);
  if (existingForParticipants.error) return { data: null, error: existingForParticipants.error, alreadyExists: false };
  if (existingForParticipants.data) {
    await markVenuePostSelected(source.post_id);
    return { data: existingForParticipants.data, error: null, alreadyExists: true };
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
      const retryByParticipants = await getBookingForParticipants(source.post_id, source.dj_id, venueId);
      if (retryByParticipants.data || retryByParticipants.error) {
        return {
          data: retryByParticipants.data,
          error: retryByParticipants.error,
          alreadyExists: !!retryByParticipants.data,
        };
      }

      const retry = await getBookingForApplication(applicationId);
      if (retry.data) await markVenuePostSelected(retry.data.post_id);
      return {
        data: retry.data,
        error: retry.error,
        alreadyExists: !!retry.data,
      };
    }

    return { data: null, error: inserted.error, alreadyExists: false };
  }

  await markVenuePostSelected(source.post_id);
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

function getBookingStatusTimestampPatch(status: BookingStatus) {
  const now = new Date().toISOString();
  if (status === "confirmed") return { confirmed_at: now };
  if (status === "completed") return { completed_at: now };
  if (status === "cancelled") return { cancelled_at: now };
  return {};
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
      .select("*, venue_posts(event_date, title)")
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
    .select("*, venue_posts(event_date)")
    .eq("id", id)
    .maybeSingle();

  if (bookingError) return { data: null, error: bookingError };
  if (!booking) return { data: null, error: new Error("Бронь не найдена или недоступна для обновления") };

  const current = booking as BookingRow & { venue_posts?: Pick<VenuePost, "event_date"> | null };

  if (nextStatus === "pending") {
    return { data: null, error: new Error("Бронь нельзя вернуть в ожидание") };
  }

  if (nextStatus === "confirmed" && !canConfirmBooking(current)) {
    return { data: null, error: new Error("Подтвердить можно только бронь в ожидании") };
  }

  if (nextStatus === "completed" && !canCompleteBooking({ ...current, eventDate: current.venue_posts?.event_date })) {
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

  return { data, error };
}

export function canUserLeaveBookingReview(
  booking: Pick<BookingRow, "status" | "dj_id" | "venue_id">,
  profileId: string | null | undefined,
) {
  return canLeaveReview(booking, profileId);
}

export function getReviewRatingSummary(reviews: Pick<ReviewRow, "rating">[]): ReviewRatingSummary {
  if (reviews.length === 0) return { averageRating: 0, count: 0 };
  return {
    averageRating: reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length,
    count: reviews.length,
  };
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
    if (!acceptedBooking) return { data: null, error: new Error("Р‘СЂРѕРЅСЊ РЅРµ СЃРѕР·РґР°РЅР°"), chatThread: null };

    const thread = await ensureChatThreadForBooking(acceptedBooking.id);
    if (thread.error) return { data: null, error: thread.error, chatThread: null };
    chatThread = thread.data;
    if (chatThread) {
      const seeded = await ensureInitialChatMessage(chatThread, "venue");
      if (seeded.error) console.warn("Initial chat message failed", seeded.error);
    }
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

// ---- Invitations ----

export function useInvitationsForDj(djId: string | undefined) {
  type DjInvitation = InvitationRow & { venue_posts: VenuePost | null; venue_profiles: Tables<"venue_profiles"> | null };
  const cacheKey = `invitations-dj:${djId ?? "none"}`;
  const [invites, setInvites] = useState<DjInvitation[]>(() => getCachedValue<DjInvitation[]>(cacheKey) ?? []);
  const fetch = async (opts?: { force?: boolean }) => {
    if (!djId) return;
    const request = async () => {
      const { data } = await supabase.from("invitations").select("*, venue_posts(*), venue_profiles(*)").eq("dj_id", djId).order("created_at", { ascending: false });
      return ((data as any) ?? []) as DjInvitation[];
    };
    const data = opts?.force ? await request() : await cachedRequest(cacheKey, request, CACHE_TTL);
    setCachedValue(cacheKey, data, CACHE_TTL);
    setInvites(data);
  };
  useEffect(() => {
    fetch({ force: true });
    if (!djId) return;

    const channel = supabase
      .channel(`invitations-dj-${djId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invitations", filter: `dj_id=eq.${djId}` },
        () => { void fetch({ force: true }); },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [cacheKey, djId]);
  const updateLocal = (invitationId: string, status: InvitationRow["status"]) => {
    setInvites((current) => {
      const next = current.map((invitation) => invitation.id === invitationId ? { ...invitation, status } : invitation);
      setCachedValue(cacheKey, next, CACHE_TTL);
      return next;
    });
  };
  return { invites, refetch: fetch, updateLocal };
}

export function useInvitationsForVenue(venueId: string | undefined) {
  type VenueInvitation = InvitationRow & { dj_profiles: Tables<"dj_profiles"> | null; venue_posts: VenuePost | null };
  const cacheKey = `invitations-venue:${venueId ?? "none"}`;
  const [invites, setInvites] = useState<VenueInvitation[]>(() => getCachedValue<VenueInvitation[]>(cacheKey) ?? []);
  const fetch = async (opts?: { force?: boolean }) => {
    if (!venueId) return;
    const request = async () => {
      const { data } = await supabase.from("invitations").select("*, dj_profiles(*), venue_posts(*)").eq("venue_id", venueId).order("created_at", { ascending: false });
      return ((data as any) ?? []) as VenueInvitation[];
    };
    const data = opts?.force ? await request() : await cachedRequest(cacheKey, request, CACHE_TTL);
    setCachedValue(cacheKey, data, CACHE_TTL);
    setInvites(data);
  };
  useEffect(() => {
    fetch({ force: true });
    if (!venueId) return;

    const channel = supabase
      .channel(`invitations-venue-${venueId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invitations", filter: `venue_id=eq.${venueId}` },
        () => { void fetch({ force: true }); },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [cacheKey, venueId]);
  const updateLocal = (invitationId: string, status: InvitationRow["status"]) => {
    setInvites((current) => {
      const next = current.map((invitation) => invitation.id === invitationId ? { ...invitation, status } : invitation);
      setCachedValue(cacheKey, next, CACHE_TTL);
      return next;
    });
  };
  return { invites, refetch: fetch, updateLocal };
}

export async function createInvitation(venueId: string, djId: string, postId: string, message?: string) {
  const [venueCheck, djCheck] = await Promise.all([
    supabase.from("venue_profiles").select("status").eq("id", venueId).maybeSingle(),
    supabase.from("dj_profiles").select("status").eq("id", djId).maybeSingle(),
  ]);
  if (venueCheck.error) return { data: null, error: venueCheck.error };
  if (djCheck.error) return { data: null, error: djCheck.error };
  if (venueCheck.data?.status !== "active") return { data: null, error: new Error("Профиль заведения ограничен модератором") };
  if (djCheck.data?.status !== "active") return { data: null, error: new Error("Профиль DJ ограничен модератором") };

  const { data: gig, error: gigError } = await getPostModerationState(postId);

  if (gigError) return { data: null, error: gigError };
  if (!gig) return { data: null, error: new Error("Публикация не найдена") };
  if (gig.venue_id !== venueId) return { data: null, error: new Error("Нельзя отправить приглашение от чужой публикации") };
  if (!isOpenGig(gig as Pick<Gig, "status">)) return { data: null, error: new Error("Эта публикация уже закрыта") };
  const interaction = canInteractWithPost(gig);
  if (!interaction.allowed) {
    return { data: null, error: new Error(interaction.reason ?? "Публикация недоступна") };
  }

  const currentRound = ((gig as any).application_round as number | null) ?? 1;
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

  const { data, error } = await supabase
    .from("invitations")
    .insert({ venue_id: venueId, dj_id: djId, post_id: postId, message, application_round: currentRound })
    .select()
    .single();
  return { data, error };
}

async function ensureAcceptedApplicationForInvitation(invitation: InvitationRow) {
  const existing = await getApplicationForDjAndGig(invitation.dj_id, invitation.post_id, invitation.application_round);
  if (existing.error) return { data: null, error: existing.error };
  if (existing.data) {
    if (isApplicationAccepted(existing.data.status)) return { data: existing.data, error: null };
    const updated = await updateApplicationStatus(existing.data.id, "accepted");
    return { data: updated.data, error: updated.error, chatThread: updated.chatThread };
  }

  const { data, error } = await supabase
    .from("applications")
    .insert({
      dj_id: invitation.dj_id,
      post_id: invitation.post_id,
      message: invitation.message,
      application_round: invitation.application_round,
      status: "accepted",
    })
    .select("id, status")
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      const retry = await getApplicationForDjAndGig(invitation.dj_id, invitation.post_id, invitation.application_round);
      return { data: retry.data, error: retry.error };
    }
    return { data: null, error };
  }

  return { data, error: null };
}

export async function updateInvitationStatus(id: string, status: "new" | "accepted" | "rejected" | "cancelled"): Promise<{
  error: Error | null;
  chatThread?: ChatThread | null;
}> {
  const { data: current, error: currentError } = await supabase
    .from("invitations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (currentError) return { error: currentError };
  if (!current) return { error: new Error("Приглашение не найдено") };

  if (status !== "accepted") {
    const { error } = await supabase.from("invitations").update({ status }).eq("id", id);
    return { error };
  }

  const { data: gig, error: gigError } = await getPostModerationState(current.post_id);
  if (gigError) return { error: gigError };
  const interaction = canInteractWithPost(gig);
  if (!interaction.allowed) {
    return { error: new Error(interaction.reason ?? "Публикация недоступна") };
  }

  const { error: clearError } = await supabase.from("invitations").update({ status: "cancelled" }).eq("id", id);
  if (clearError) return { error: clearError };

  const application = await ensureAcceptedApplicationForInvitation(current as InvitationRow);
  if (application.error || !application.data) {
    await supabase.from("invitations").update({ status: current.status }).eq("id", id);
    return { error: application.error ?? new Error("Не удалось создать отклик по приглашению") };
  }

  const applicationId = application.data.id;
  const booking = await createBookingForAcceptedApplication(applicationId);
  if (booking.error) {
    await supabase.from("invitations").update({ status: current.status }).eq("id", id);
    return { error: booking.error };
  }
  if (!booking.data) {
    await supabase.from("invitations").update({ status: current.status }).eq("id", id);
    return { error: new Error("Р‘СЂРѕРЅСЊ РЅРµ СЃРѕР·РґР°РЅР°") };
  }

  const thread = await ensureChatThreadForBooking(booking.data.id);
  if (thread.error) {
    await supabase.from("invitations").update({ status: current.status }).eq("id", id);
    return { error: thread.error };
  }
  if (thread.data) {
    const seeded = await ensureInitialChatMessage(thread.data, "dj");
    if (seeded.error) {
      console.warn("Initial chat message failed", seeded.error);
    }
  }

  const { error } = await supabase.from("invitations").update({ status }).eq("id", id);
  if (error) return { error };

  return { error: null, chatThread: thread.data };
}

export async function checkInvited(venueId: string, djId: string, postId: string): Promise<boolean> {
  const { data: gig } = await supabase
    .from("venue_posts")
    .select("application_round")
    .eq("id", postId)
    .maybeSingle();
  const currentRound = ((gig as any)?.application_round as number | null) ?? 1;
  const { data } = await supabase
    .from("invitations")
    .select("id")
    .eq("venue_id", venueId)
    .eq("dj_id", djId)
    .eq("post_id", postId)
    .eq("application_round", currentRound)
    .in("status", ["new", "accepted"])
    .limit(1)
    .maybeSingle();
  return !!data;
}

// ---- Admin ----

export function useAllApplications() {
  const [apps, setApps] = useState<GigApplicationForVenue[]>([]);
  const fetch = async () => {
    const { data } = await supabase.from("applications").select("*, dj_profiles(*), venue_posts(*)").order("created_at", { ascending: false });
    setApps((data as any) ?? []);
  };
  useEffect(() => { fetch(); }, []);
  return { apps, refetch: fetch };
}

export function useAllInvitations() {
  const [invites, setInvites] = useState<(InvitationRow & { dj_profiles: Tables<"dj_profiles"> | null; venue_posts: VenuePost | null; venue_profiles: Tables<"venue_profiles"> | null })[]>([]);
  const fetch = async () => {
    const { data } = await supabase.from("invitations").select("*, dj_profiles(*), venue_posts(*), venue_profiles(*)").order("created_at", { ascending: false });
    setInvites((data as any) ?? []);
  };
  useEffect(() => { fetch(); }, []);
  return { invites, refetch: fetch };
}

export function useAllVenuePosts() {
  const [posts, setPosts] = useState<GigWithVenue[]>([]);
  const fetch = async () => {
    const { data } = await supabase.from("venue_posts").select("*, venue_profiles(*)").order("created_at", { ascending: false });
    setPosts((data as any) ?? []);
  };
  useEffect(() => { fetch(); }, []);
  const removePost = (postId: string) => setPosts((current) => current.filter((post) => post.id !== postId));
  const updatePost = (postId: string, updates: Partial<GigWithVenue>) => {
    setPosts((current) => current.map((post) => post.id === postId ? { ...post, ...updates } : post));
  };
  return { posts, refetch: fetch, removePost, updatePost };
}
