import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Gig, GigInsert, GigStatus, GigType } from "@/lib/gigs";
import { getVenuePostSelection } from "@/domains/applications/applications.hooks";
import { cachedRequest, getCacheSnapshot, patchCachedListsWhere, setCachedValue } from "@/lib/requestCache";
import {
  canInteractWithPost,
  getPostVisibility,
  normalizePostModerationStatus,
  parseVenuePostsFiltersKey,
  postMatchesVenuePostsFilters,
  type VenuePostModerationStatus,
} from "@/domains/posts/posts.rules";

export {
  canInteractWithPost,
  getPostVisibility,
  getVenuePostSelection,
  normalizePostModerationStatus,
};
export type { VenuePostModerationStatus };

export type VenuePost = Gig;
export type VenuePostInsert = GigInsert;

const CACHE_TTL = 90_000;
const POSTS_PROXY_URL = "http://localhost:3001/api/posts";

function isMissingColumnError(error: { message?: string } | null | undefined, column: string) {
  return (error?.message?.toLowerCase() ?? "").includes(column.toLowerCase());
}

export async function getPostModerationState(postId: string) {
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

async function fetchPublicOpenVenuePostsFromSupabase(filters?: { city?: string; style?: string; status?: GigStatus; postType?: GigType; venueId?: string }) {
  const runQuery = async (includeModerationFilter: boolean) => {
    let q = supabase.from("venue_posts").select("*, venue_profiles(name, image_url)").order("created_at", { ascending: false });
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
}

async function fetchPublicOpenVenuePostsProxyFirst(
  filters?: { city?: string; style?: string; status?: GigStatus; postType?: GigType; venueId?: string },
  forceRefresh = false,
) {
  try {
    const response = await fetch(forceRefresh ? `${POSTS_PROXY_URL}?ts=${Date.now()}` : POSTS_PROXY_URL);
    if (!response.ok) {
      throw new Error(`Proxy responded with ${response.status}`);
    }

    const payload = await response.json() as { ok?: boolean; data?: VenuePost[] };
    if (!payload?.ok || !Array.isArray(payload.data)) {
      throw new Error("Proxy returned unexpected venue posts payload");
    }

    let result = payload.data;
    if (filters?.city) result = result.filter((post) => post.city === filters.city);
    if (filters?.status) result = result.filter((post) => post.status === filters.status);
    if (filters?.postType) result = result.filter((post) => post.post_type === filters.postType);
    if (filters?.style) result = result.filter((post) => post.music_styles.includes(filters.style));
    return result;
  } catch (error) {
    console.warn("Venue posts proxy failed, falling back to Supabase", error);
    return fetchPublicOpenVenuePostsFromSupabase(filters);
  }
}

async function getVenuePostCurrentRound(postId: string) {
  const { data, error } = await supabase
    .from("venue_posts")
    .select("application_round")
    .eq("id", postId)
    .maybeSingle();
  return { data, error, round: ((data as any)?.application_round as number | null) ?? 1 };
}

export function useVenuePosts(filters?: { city?: string; style?: string; status?: GigStatus; postType?: GigType; venueId?: string }) {
  const cacheKey = `venue-posts:${JSON.stringify(filters ?? {})}`;
  const cacheSnapshot = getCacheSnapshot<VenuePost[]>(cacheKey);
  const [posts, setPosts] = useState<VenuePost[]>(() => cacheSnapshot.value ?? []);
  const [loading, setLoading] = useState(() => !cacheSnapshot.value);
  const requestId = useRef(0);

  const fetch = async (opts?: { silent?: boolean; force?: boolean; forceRefresh?: boolean }) => {
    const currentRequestId = ++requestId.current;
    if (filters?.status === "closed" && !filters?.venueId) {
      setPosts([]);
      setCachedValue(cacheKey, [] as VenuePost[], CACHE_TTL);
      setLoading(false);
      return;
    }

    if (!opts?.silent) setLoading(true);
    console.time("posts load");
    const request = async () => {
      const shouldUseProxy = !filters?.venueId && (filters?.status ?? "open") === "open";
      if (shouldUseProxy) {
        return fetchPublicOpenVenuePostsProxyFirst(filters, !!opts?.forceRefresh);
      }
      return fetchPublicOpenVenuePostsFromSupabase(filters);
    };
    const result = opts?.force || opts?.forceRefresh ? await request() : await cachedRequest(cacheKey, request, CACHE_TTL);
    console.timeEnd("posts load");
    if (currentRequestId !== requestId.current) return;
    setCachedValue(cacheKey, result, CACHE_TTL);
    setPosts(result);
    setLoading(false);
  };

  useEffect(() => {
    const snapshot = getCacheSnapshot<VenuePost[]>(cacheKey);
    if (snapshot.value) {
      setPosts(snapshot.value);
      setLoading(false);
    } else {
      setPosts([]);
      setLoading(true);
    }

    if (snapshot.exists && !snapshot.isStale) {
      return;
    }

    if (snapshot.value) {
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
  const cacheSnapshot = getCacheSnapshot<VenuePost[]>(cacheKey);
  const [posts, setPosts] = useState<VenuePost[]>(() => cacheSnapshot.value ?? []);
  const [loading, setLoading] = useState(() => !cacheSnapshot.value);
  const requestId = useRef(0);
  const fetch = async (opts?: { force?: boolean; silent?: boolean }) => {
    const currentRequestId = ++requestId.current;
    if (!venueId) {
      setPosts([]);
      setLoading(false);
      return;
    }
    if (!opts?.silent) setLoading(true);
    const request = async () => {
      const { data } = await supabase.from("venue_posts").select("*").eq("venue_id", venueId).order("created_at", { ascending: false });
      return data ?? [];
    };
    const data = opts?.force ? await request() : await cachedRequest(cacheKey, request, CACHE_TTL);
    if (currentRequestId !== requestId.current) return;
    setCachedValue(cacheKey, data, CACHE_TTL);
    setPosts(data);
    setLoading(false);
  };
  useEffect(() => {
    const snapshot = getCacheSnapshot<VenuePost[]>(cacheKey);
    if (snapshot.value) {
      setPosts(snapshot.value);
      setLoading(false);
    } else {
      setPosts([]);
      setLoading(true);
    }

    if (snapshot.exists && !snapshot.isStale) {
      return;
    }

    if (snapshot.value) {
      void fetch({ silent: true, force: true });
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
  return { posts, loading, refetch: fetch, removePost, addPost, updatePost };
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
  const { data, error } = await supabase
    .from("venue_posts")
    .insert(post)
    .select("*, venue_profiles(name, image_url)")
    .single();

  if (error) return { data: null, error };
  if (data) {
    const createdPost = data as VenuePost;
    syncVenuePostCaches(createdPost);
    setCachedValue(`post:${createdPost.id}`, createdPost, CACHE_TTL);
  }

  return { data: data as VenuePost, error: null };
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
  if (!post) {
    return { error: new Error("Публикация не найдена или уже удалена"), action: "none" as const };
  }

  if (post.status === "open") {
    return {
      error: new Error("Активную публикацию нельзя удалить. Сначала закройте или архивируйте её."),
      action: "blocked" as const,
    };
  }

  const deleted = await (supabase as any).rpc("delete_archived_venue_post", { post_uuid: id });

  if (!deleted.error) {
    patchCachedListsWhere<VenuePost>(
      (key) => key.startsWith("venue-posts:") || key.startsWith("venue-posts-by-venue:"),
      (items) => items.filter((post) => post.id !== id),
      CACHE_TTL,
    );
    return { error: null, action: "deleted" as const };
  }

  return { error: deleted.error ?? new Error("Публикацию не удалось удалить"), action: "none" as const };
}
