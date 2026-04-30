import { useEffect, useRef, useState } from "react";
import type { Gig, GigInsert, GigStatus, GigType } from "@/lib/gigs";
import { supabase } from "@/integrations/supabase/client";
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
const API_URL = import.meta.env.VITE_API_URL;
const POSTS_PROXY_URL = `${API_URL}/api/posts`;
const VENUE_POSTS_PROXY_URL = `${API_URL}/api/venue-posts`;
const POSTS_TIMEOUT_MS = 3000;

async function getAuthHeaders() {
const {
  data: { session },
} = await supabase.auth.getSession();

return session?.access_token
  ? { Authorization: `Bearer ${session.access_token}` }
  : {};
}

function isMissingColumnError(error: { message?: string } | null | undefined, column: string) {
return (error?.message?.toLowerCase() ?? "").includes(column.toLowerCase());
}

async function fetchJson<T>(url: string, init: RequestInit | undefined, fallback: T): Promise<T> {
const controller = new AbortController();
const timeoutId = window.setTimeout(() => controller.abort(), POSTS_TIMEOUT_MS);

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

if (!response.ok) {
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  console.error("Posts backend request failed", {
    url,
    method: init?.method ?? "GET",
    status: response.status,
    error: payload?.error ?? null,
    body: init?.body ?? null,
  });
  return fallback;
}

const payload = await response.json() as { ok?: boolean; data?: T; error?: string };
if (!payload?.ok) {
  console.error("Posts backend returned error payload", {
    url,
    method: init?.method ?? "GET",
    error: payload?.error ?? null,
    body: init?.body ?? null,
  });
  return fallback;
}

return payload.data ?? fallback;
} catch (error) {
console.error("Posts backend request error", {
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

export async function getPostModerationState(postId: string) {
const posts = await fetchVenuePostsFromBackend({ id: postId });
const post = posts[0] as (VenuePost & { application_round?: number | null; moderation_status?: string | null }) | undefined;

if (!post) {
return { data: null, error: null };
}

return {
data: {
id: post.id,
status: post.status,
application_round: post.application_round ?? 1,
venue_id: post.venue_id,
moderation_status: normalizePostModerationStatus(post.moderation_status),
},
error: null,
};
}

function syncVenuePostCaches(post: VenuePost) {
patchCachedListsWhere<VenuePost>(
(key) => key.startsWith("venue-posts:") || key.startsWith("venue-posts-by-venue:"),
(items, key) => {
const withoutPost = items.filter((item) => item.id !== post.id);

const shouldInclude = key.startsWith("venue-posts-by-venue:")
? key === `venue-posts-by-venue:${post.venue_id}`
: postMatchesVenuePostsFilters(post, parseVenuePostsFiltersKey(key));

return shouldInclude
? [post, ...withoutPost].sort(
(a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
)
: withoutPost;
},
CACHE_TTL,
);
}

async function fetchVenuePostsFromBackend(
filters?: {
id?: string;
city?: string;
style?: string;
status?: GigStatus;
postType?: GigType;
venueId?: string;
},
forceRefresh = false,
) {
const controller = new AbortController();
const timeoutId = window.setTimeout(() => controller.abort(), POSTS_TIMEOUT_MS);

try {
const searchParams = new URLSearchParams();

if (filters?.id) searchParams.set("id", filters.id);
if (filters?.city) searchParams.set("city", filters.city);
if (filters?.style) searchParams.set("style", filters.style);
if (filters?.status) searchParams.set("status", filters.status);
if (filters?.postType) searchParams.set("postType", filters.postType);
if (filters?.venueId) searchParams.set("venueId", filters.venueId);
if (forceRefresh) searchParams.set("ts", String(Date.now()));

const url = searchParams.size > 0 ? `${VENUE_POSTS_PROXY_URL}?${searchParams.toString()}` : VENUE_POSTS_PROXY_URL;
const response = await fetch(url, { signal: controller.signal });

if (!response.ok) {
return null;
}

const payload = await response.json() as VenuePost[] | { ok?: boolean; data?: VenuePost[] };

const proxyPosts = Array.isArray(payload)
? payload
: payload?.ok && Array.isArray(payload.data)
? payload.data
: [];

return proxyPosts;
} catch (error) {
console.warn("Venue posts backend fetch failed", error);
return null;
} finally {
window.clearTimeout(timeoutId);
}
}

async function fetchPublicOpenVenuePostsProxyFirst(
filters?: {
id?: string;
city?: string;
style?: string;
status?: GigStatus;
postType?: GigType;
venueId?: string;
},
forceRefresh = false,
) {
return fetchVenuePostsFromBackend(filters, forceRefresh);
}

async function getVenuePostCurrentRound(postId: string) {
const posts = await fetchVenuePostsFromBackend({ id: postId });
const post = posts[0] as (VenuePost & { application_round?: number | null }) | undefined;

return {
data: post ? { application_round: post.application_round ?? 1 } : null,
error: null,
round: post?.application_round ?? 1,
};
}

export function useVenuePosts(filters?: {
city?: string;
style?: string;
status?: GigStatus;
postType?: GigType;
venueId?: string;
}) {
const cacheKey = `venue-posts:${JSON.stringify(filters ?? {})}`;
const cacheSnapshot = getCacheSnapshot<VenuePost[]>(cacheKey);
const [posts, setPosts] = useState<VenuePost[]>(() => cacheSnapshot.value ?? []);
const [loading, setLoading] = useState(() => !cacheSnapshot.value);
const [error, setError] = useState<string | null>(null);
const requestId = useRef(0);
const postsRef = useRef<VenuePost[]>(cacheSnapshot.value ?? []);
const inFlightRef = useRef(false);
const inFlightPromiseRef = useRef<Promise<void> | null>(null);

useEffect(() => {
postsRef.current = posts;
}, [posts]);

const fetch = async (opts?: { silent?: boolean; force?: boolean; forceRefresh?: boolean }) => {
if (inFlightRef.current) return inFlightPromiseRef.current ?? Promise.resolve();
const currentRequestId = ++requestId.current;

if (filters?.status === "closed" && !filters?.venueId) {
setPosts([]);
setCachedValue(cacheKey, [] as VenuePost[], CACHE_TTL);
setError(null);
setLoading(false);
return;
}

if (!opts?.silent && postsRef.current.length === 0) setLoading(true);

console.time("posts load");
inFlightRef.current = true;
const request = (async () => {
  try {
    const run = async () => fetchPublicOpenVenuePostsProxyFirst(filters, !!opts?.forceRefresh);

    const result = opts?.force || opts?.forceRefresh
      ? await run()
      : await cachedRequest(cacheKey, run, CACHE_TTL);

    console.timeEnd("posts load");

    if (currentRequestId !== requestId.current) return;

    if (result === null) {
      setError("Не удалось загрузить публикации");
      setLoading(false);
      return;
    }

    setError(null);
    setCachedValue(cacheKey, result, CACHE_TTL);
    setPosts(result);
    setLoading(false);
  } finally {
    inFlightRef.current = false;
    inFlightPromiseRef.current = null;
  }
})();

inFlightPromiseRef.current = request;
return request;
};

useEffect(() => {
const snapshot = getCacheSnapshot<VenuePost[]>(cacheKey);

if (snapshot.value) {
setPosts(snapshot.value);
setError(null);
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

return { posts, loading, error, refetch: fetch, addPost, updatePost, removePost };
}

export function useVenuePostsByVenue(venueId: string | undefined) {
const cacheKey = `venue-posts-by-venue:${venueId ?? "none"}`;
const cacheSnapshot = getCacheSnapshot<VenuePost[]>(cacheKey);
const [posts, setPosts] = useState<VenuePost[]>(() => cacheSnapshot.value ?? []);
const [loading, setLoading] = useState(() => !cacheSnapshot.value);
const [error, setError] = useState<string | null>(null);
const requestId = useRef(0);
const postsRef = useRef<VenuePost[]>(cacheSnapshot.value ?? []);
const inFlightRef = useRef(false);
const inFlightPromiseRef = useRef<Promise<void> | null>(null);

useEffect(() => {
postsRef.current = posts;
}, [posts]);

const fetch = async (opts?: { force?: boolean; silent?: boolean }) => {
if (inFlightRef.current) return inFlightPromiseRef.current ?? Promise.resolve();
const currentRequestId = ++requestId.current;

if (!venueId) {
setPosts([]);
setError(null);
setLoading(false);
return;
}

if (!opts?.silent && postsRef.current.length === 0) setLoading(true);

inFlightRef.current = true;
const request = (async () => {
  try {
    const run = async () => fetchVenuePostsFromBackend({ venueId }, false);

    const data = opts?.force ? await run() : await cachedRequest(cacheKey, run, CACHE_TTL);

    if (currentRequestId !== requestId.current) return;

    if (data === null) {
      setError("Не удалось загрузить публикации");
      setLoading(false);
      return;
    }

    setError(null);
    setCachedValue(cacheKey, data, CACHE_TTL);
    setPosts(data);
    setLoading(false);
  } finally {
    inFlightRef.current = false;
    inFlightPromiseRef.current = null;
  }
})();

inFlightPromiseRef.current = request;
return request;
};

useEffect(() => {
const snapshot = getCacheSnapshot<VenuePost[]>(cacheKey);

if (snapshot.value) {
setPosts(snapshot.value);
setError(null);
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

return { posts, loading, error, refetch: fetch, removePost, addPost, updatePost };
}

export async function createVenuePost(post: VenuePostInsert) {
const venue = await fetchJson<{ status?: string | null } | null>(
`${API_URL}/api/venue-profile-by-id${toQuery({ id: post.venue_id })}`,
undefined,
null,
);

if (!venue) return { data: null, error: new Error("Р СџРЎР‚Р С•РЎвЂћР С‘Р В»РЎРЉ Р В·Р В°Р Р†Р ВµР Т‘Р ВµР Р…Р С‘РЎРЏ Р Р…Р ВµР Т‘Р С•РЎРѓРЎвЂљРЎС“Р С—Р ВµР Р…") };

if (venue?.status !== "active") {
return { data: null, error: new Error("РџСЂРѕС„РёР»СЊ Р·Р°РІРµРґРµРЅРёСЏ РѕРіСЂР°РЅРёС‡РµРЅ РјРѕРґРµСЂР°С‚РѕСЂРѕРј") };
}

const data = await fetchJson<VenuePost | null>(
`${API_URL}/api/venue-posts`,
{
  method: "POST",
  body: JSON.stringify(post),
},
null,
);

if (!data) return { data: null, error: new Error("Р СњР Вµ РЎС“Р Т‘Р В°Р В»Р С•РЎРѓРЎРЉ РЎРѓР С•Р В·Р Т‘Р В°РЎвЂљРЎРЉ Р С—РЎС“Р В±Р В»Р С‘Р С”Р В°РЎвЂ Р С‘РЎР‹") };

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
return { data: null, error: new Error("РџСѓР±Р»РёРєР°С†РёСЏ Р·Р°Р±Р»РѕРєРёСЂРѕРІР°РЅР° РјРѕРґРµСЂР°С‚РѕСЂРѕРј") };
}

if (currentVisibility.moderationStatus === "archived") {
return { data: null, error: new Error("РџСѓР±Р»РёРєР°С†РёСЏ РЅР°С…РѕРґРёС‚СЃСЏ РІ Р°СЂС…РёРІРµ") };
}

if (updates.status === "closed") {
const selection = await getVenuePostSelection(id);

if (selection.error) return { data: null, error: selection.error };

const engagement = selection.isSelected
? { error: null, hasEngagement: false }
: await getVenuePostEngagement(id);

if (engagement.error) return { data: null, error: engagement.error };

if (engagement.hasEngagement) {
return {
data: null,
error: new Error("РџСѓР±Р»РёРєР°С†РёСЋ СЃ РѕС‚РєР»РёРєР°РјРё, РїСЂРёРіР»Р°С€РµРЅРёСЏРјРё, Р±СЂРѕРЅСЏРјРё РёР»Рё С‡Р°С‚РѕРј РЅРµР»СЊР·СЏ Р·Р°РєСЂС‹С‚СЊ."),
};
}
}

if (updates.status === "open") {
const currentList = await fetchJson<Array<{ status?: string | null; application_round?: number | null }>>(
`${API_URL}/api/venue-posts${toQuery({ id })}`,
undefined,
[],
);
const current = currentList[0] ?? null;

if ((current as any)?.status === "closed") {
nextUpdates = {
...updates,
application_round: (((current as any)?.application_round as number | null) ?? 1) + 1,
};
}
}

const data = await fetchJson<VenuePost | null>(
`${API_URL}/api/venue-posts/${id}`,
{
  method: "PATCH",
  body: JSON.stringify(nextUpdates),
},
null,
);

if (!data) return { data: null, error: new Error("Р СџРЎС“Р В±Р В»Р С‘Р С”Р В°РЎвЂ Р С‘РЎРЏ Р Р…Р Вµ Р Р…Р В°Р в„–Р Т‘Р ВµР Р…Р В° Р С‘Р В»Р С‘ Р Р…Р ВµР Т‘Р С•РЎРѓРЎвЂљРЎС“Р С—Р Р…Р В° Р Т‘Р В»РЎРЏ Р С•Р В±Р Р…Р С•Р Р†Р В»Р ВµР Р…Р С‘РЎРЏ") };

if (!data) {
return {
data: null,
error: new Error("РџСѓР±Р»РёРєР°С†РёСЏ РЅРµ РЅР°Р№РґРµРЅР° РёР»Рё РЅРµРґРѕСЃС‚СѓРїРЅР° РґР»СЏ РѕР±РЅРѕРІР»РµРЅРёСЏ"),
};
}

const updatedPost = data as VenuePost;

syncVenuePostCaches(updatedPost);
setCachedValue(`post:${id}`, updatedPost, CACHE_TTL);

return { data: updatedPost, error: null };
}

export async function getVenuePostEngagement(id: string) {
const currentPost = await getVenuePostCurrentRound(id);

if (currentPost.error) {
return { error: currentPost.error, hasEngagement: false };
}

const currentRound = currentPost.round;

const [applications, invitations, bookings] = await Promise.all([
fetchJson<unknown[]>(
`${API_URL}/api/applications${toQuery({ postId: id, applicationRound: currentRound, status: "new,accepted" })}`,
undefined,
[],
),

fetchJson<unknown[]>(
`${API_URL}/api/invitations${toQuery({ postId: id, applicationRound: currentRound, status: "new,accepted" })}`,
undefined,
[],
),

fetchJson<unknown[]>(
`${API_URL}/api/bookings${toQuery({ postId: id, applicationRound: currentRound, status: "pending,confirmed" })}`,
undefined,
[],
),
]);

return {
error: null,
hasEngagement:
applications.length > 0 ||
invitations.length > 0 ||
bookings.length > 0,
};
}

export async function deleteVenuePost(id: string) {
const { data: post, error: postError } = await getPostModerationState(id);

if (postError) return { error: postError, action: "none" as const };

if (!post) {
return {
error: new Error("РџСѓР±Р»РёРєР°С†РёСЏ РЅРµ РЅР°Р№РґРµРЅР° РёР»Рё СѓР¶Рµ СѓРґР°Р»РµРЅР°"),
action: "none" as const,
};
}

if (post.status === "open") {
return {
error: new Error("РђРєС‚РёРІРЅСѓСЋ РїСѓР±Р»РёРєР°С†РёСЋ РЅРµР»СЊР·СЏ СѓРґР°Р»РёС‚СЊ. РЎРЅР°С‡Р°Р»Р° Р·Р°РєСЂРѕР№С‚Рµ РёР»Рё Р°СЂС…РёРІРёСЂСѓР№С‚Рµ РµС‘."),
action: "blocked" as const,
};
}

const deleted = await fetchJson<{ deleted?: boolean } | null>(
`${API_URL}/api/venue-posts/${id}/archive-cleanup`,
{
method: "DELETE",
},
null,
);

if (deleted?.deleted) {
patchCachedListsWhere<VenuePost>(
(key) => key.startsWith("venue-posts:") || key.startsWith("venue-posts-by-venue:"),
(items) => items.filter((post) => post.id !== id),
CACHE_TTL,
);

return { error: null, action: "deleted" as const };
}

return {
error: new Error("Не удалось удалить публикацию"),
action: "none" as const,
};
}
