import "dotenv/config";
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

const app = express();

app.use(cors({
origin: true,
credentials: true,
}));

const port = Number(process.env.PORT || 3001);
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

const CACHE_TTL = 5 * 60 * 1000;
const POSTS_CACHE_TTL = 10 * 1000;

const djsCache = {
data: null,
expiresAt: 0,
promise: null,
};

const venuesCache = {
data: null,
expiresAt: 0,
promise: null,
};

const postsCache = {
data: null,
expiresAt: 0,
promise: null,
};

if (!supabaseUrl || !supabaseAnonKey) {
throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY in server environment");
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
auth: {
persistSession: false,
autoRefreshToken: false,
},
});

app.use(express.json());

app.get("/health", (_req, res) => {
res.json({ ok: true });
});

async function fetchDjsFromSupabase() {
const { data, error } = await supabase
.from("dj_profiles")
.select(`
id,
user_id,
name,
city,
image_url,
styles,
priority_style,
price,
experience,
played_at,
availability,
bio,
contact,
format,
instagram,
soundcloud,
open_to_collab,
open_to_crew,
status,
is_verified,
is_trusted,
created_at,
updated_at
`)
.eq("status", "active")
.order("created_at", { ascending: false });

if (error) {
throw error;
}

return data ?? [];
}

async function fetchVenuesFromSupabase() {
const { data, error } = await supabase
.from("venue_profiles")
.select("id, user_id, name, city, type, music_styles, image_url, status, created_at, is_verified, is_trusted")
.eq("status", "active")
.order("created_at", { ascending: false });

if (error) {
throw error;
}

return data ?? [];
}

async function fetchPostsFromSupabase(filters = {}) {
const baseSelect = "*, venue_profiles(name, image_url)";
const {
venueId,
status,
postType,
city,
style,
} = filters;

const runQuery = async (includeModerationFilter) => {
let query = supabase
.from("venue_posts")
.select(baseSelect)
.order("created_at", { ascending: false });

if (venueId) {
query = query.eq("venue_id", venueId);
} else {
query = query.eq("status", status ?? "open");
if (includeModerationFilter) {
query = query.eq("moderation_status", "active");
}
}

if (status && venueId) query = query.eq("status", status);
if (postType) query = query.eq("post_type", postType);
if (city) query = query.eq("city", city);

return query;
};

let { data, error } = await runQuery(!venueId);

if (error && String(error.message ?? "").toLowerCase().includes("moderation_status")) {
({ data, error } = await runQuery(false));
}

if (error) {
throw error;
}

let result = data ?? [];

if (style) {
result = result.filter((post) => Array.isArray(post.music_styles) && post.music_styles.includes(style));
}

return result;
}

async function fetchVenueByIdFromSupabase(id) {
const { data, error } = await supabase
.from("venue_profiles")
.select("*")
.eq("id", id)
.eq("status", "active")
.maybeSingle();

if (error) {
throw error;
}

return data ?? null;
}

async function fetchDjByIdFromSupabase(id) {
const { data, error } = await supabase
.from("dj_profiles")
.select(`
id,
user_id,
name,
city,
image_url,
styles,
priority_style,
price,
experience,
played_at,
availability,
bio,
contact,
format,
instagram,
soundcloud,
open_to_collab,
open_to_crew,
status,
is_verified,
is_trusted,
created_at,
updated_at
`)
.eq("id", id)
.eq("status", "active")
.maybeSingle();

if (error) {
throw error;
}

return data ?? null;
}

async function fetchPostByIdFromSupabase(id) {
const baseSelect = `
id,
venue_id,
title,
city,
description,
budget,
music_styles,
post_type,
status,
event_date,
deadline,
start_time,
duration,
frequency,
requirements,
portfolio_required,
schedule,
created_at,
venue_profiles(name, user_id, image_url)
`;

let { data, error } = await supabase
.from("venue_posts")
.select(baseSelect)
.eq("id", id)
.single();

if (error) {
throw error;
}

return data ?? null;
}

async function fetchReviewsForProfileFromSupabase(id) {
const { data, error } = await supabase
.from("reviews")
.select("id, booking_id, reviewer_id, target_id, rating, comment, created_at")
.eq("target_id", id)
.order("created_at", { ascending: false });

if (error) {
throw error;
}

return data ?? [];
}

function isFresh(cache) {
return cache.data && cache.expiresAt > Date.now();
}

async function warmCache(label, cache, loader, ttl = CACHE_TTL) {
if (cache.promise) return cache.promise;

cache.promise = loader()
.then((data) => {
cache.data = data;
cache.expiresAt = Date.now() + ttl;
console.log(`[proxy] preload success: ${label} (${Array.isArray(data) ? data.length : 0} rows)`);
return data;
})
.catch((error) => {
console.warn(`[proxy] preload failure: ${label}`, error?.message ?? error);
throw error;
})
.finally(() => {
cache.promise = null;
});

return cache.promise;
}

function refreshInBackground(label, cache, loader, ttl = CACHE_TTL) {
if (cache.promise) return;

cache.promise = loader()
.then((data) => {
cache.data = data;
cache.expiresAt = Date.now() + ttl;
console.log(`[proxy] background refresh success: ${label}`);
return data;
})
.catch((error) => {
console.warn(`[proxy] background refresh failure: ${label}`, error?.message ?? error);
return cache.data;
})
.finally(() => {
cache.promise = null;
});
}

async function handleCachedCollection(req, res, label, cache, loader, ttl = CACHE_TTL) {
console.time(label);

if (isFresh(cache)) {
console.log(`[proxy] cache hit: ${label}`);
res.json({ ok: true, data: cache.data });
console.timeEnd(label);
return;
}

if (cache.data) {
console.log(`[proxy] cache stale hit: ${label}`);
res.json({ ok: true, data: cache.data });
console.timeEnd(label);
refreshInBackground(label, cache, loader, ttl);
return;
}

console.log(`[proxy] cache miss: ${label}`);

try {
const data = await warmCache(label, cache, loader, ttl);
res.json({ ok: true, data });
} catch (error) {
res.status(500).json({
ok: false,
error: error?.message ?? "Unknown proxy error",
});
}

console.timeEnd(label);
}

app.get("/api/djs", async (req, res) => {
await handleCachedCollection(req, res, "api/djs", djsCache, fetchDjsFromSupabase);
});

app.get("/api/djs/:id", async (req, res) => {
console.time("api/djs/:id");

try {
const data = await fetchDjByIdFromSupabase(req.params.id);
res.json({ ok: true, data });
} catch (error) {
res.status(500).json({
ok: false,
error: error?.message ?? "Unknown proxy error",
});
}

console.timeEnd("api/djs/:id");
});

app.get("/api/venues", async (req, res) => {
await handleCachedCollection(req, res, "api/venues", venuesCache, fetchVenuesFromSupabase);
});

app.get("/api/venues/:id", async (req, res) => {
console.time("api/venues/:id");

try {
const data = await fetchVenueByIdFromSupabase(req.params.id);
res.json({ ok: true, data });
} catch (error) {
res.status(500).json({
ok: false,
error: error?.message ?? "Unknown proxy error",
});
}

console.timeEnd("api/venues/:id");
});

app.get("/api/posts", async (req, res) => {
const filters = {
venueId: typeof req.query.venueId === "string" ? req.query.venueId : undefined,
status: typeof req.query.status === "string" ? req.query.status : undefined,
postType: typeof req.query.postType === "string" ? req.query.postType : undefined,
city: typeof req.query.city === "string" ? req.query.city : undefined,
style: typeof req.query.style === "string" ? req.query.style : undefined,
};

if (req.query.ts) {
console.time("api/posts");
console.log("[proxy] cache bypass: api/posts");

postsCache.data = null;
postsCache.expiresAt = 0;

try {
const data = await fetchPostsFromSupabase(filters);
postsCache.data = data;
postsCache.expiresAt = Date.now() + POSTS_CACHE_TTL;
res.json({ ok: true, data });
} catch (error) {
res.status(500).json({
ok: false,
error: error?.message ?? "Unknown proxy error",
});
}

console.timeEnd("api/posts");
return;
}

const shouldUseSharedCache = !filters.venueId && !filters.status && !filters.postType && !filters.city && !filters.style;

if (shouldUseSharedCache) {
await handleCachedCollection(req, res, "api/posts", postsCache, () => fetchPostsFromSupabase(filters), POSTS_CACHE_TTL);
return;
}

console.time("api/posts");

try {
const data = await fetchPostsFromSupabase(filters);
res.json({ ok: true, data });
} catch (error) {
res.status(500).json({
ok: false,
error: error?.message ?? "Unknown proxy error",
});
}

console.timeEnd("api/posts");
});

app.get("/api/posts/:id", async (req, res) => {
console.time("api/posts/:id");

try {
const data = await fetchPostByIdFromSupabase(req.params.id);
res.json({ ok: true, data });
} catch (error) {
res.status(500).json({
ok: false,
error: error?.message ?? "Unknown proxy error",
});
}

console.timeEnd("api/posts/:id");
});

app.get("/api/profiles/:id/reviews", async (req, res) => {
console.time("api/profiles/:id/reviews");

try {
const data = await fetchReviewsForProfileFromSupabase(req.params.id);
res.json({ ok: true, data });
} catch (error) {
res.status(500).json({
ok: false,
error: error?.message ?? "Unknown proxy error",
});
}

console.timeEnd("api/profiles/:id/reviews");
});

app.listen(port, () => {
console.log(`DJHUB backend proxy listening on http://localhost:${port}`);

void warmCache("api/djs", djsCache, fetchDjsFromSupabase).catch(() => {});
void warmCache("api/venues", venuesCache, fetchVenuesFromSupabase).catch(() => {});
void warmCache("api/posts", postsCache, fetchPostsFromSupabase, POSTS_CACHE_TTL).catch(() => {});
});
