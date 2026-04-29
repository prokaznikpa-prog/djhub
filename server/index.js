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
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CACHE_TTL = 5 * 60 * 1000;
const POSTS_CACHE_TTL = 10 * 1000;
const PROFILE_SUMMARY_TIMEOUT_MS = 4500;

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

const supabaseAdmin = supabaseServiceRoleKey
? createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})
: null;

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

function getBearerToken(req) {
const header = req.headers.authorization;

if (!header || typeof header !== "string") return null;

const match = header.match(/^Bearer\s+(.+)$/i);
return match?.[1] ?? null;
}

function getProfileSummaryFallback() {
return {
isAdmin: false,
djProfile: null,
venueProfile: null,
};
}

function pickDefined(source, keys) {
const result = {};
keys.forEach((key) => {
  if (Object.prototype.hasOwnProperty.call(source ?? {}, key) && source[key] !== undefined) {
    result[key] = source[key];
  }
});
return result;
}

function isNonEmptyString(value) {
return typeof value === "string" && value.trim().length > 0;
}

function hasMissingColumnError(error, column) {
return (error?.message?.toLowerCase() ?? "").includes(column.toLowerCase());
}

function requireAdminClient(res) {
if (!supabaseAdmin) {
  res.status(500).json({
    ok: false,
    error: "SUPABASE_SERVICE_ROLE_KEY is required for backend write routes",
  });
  return null;
}

return supabaseAdmin;
}

async function getAuthenticatedUserId(req) {
const accessToken = getBearerToken(req);
if (!accessToken) return null;

try {
  const {
    data: { user },
    error,
  } = await withTimeout(
    supabase.auth.getUser(accessToken),
    PROFILE_SUMMARY_TIMEOUT_MS,
    "resolve-auth-user"
  );

  if (error || !user) return null;
  return user.id;
} catch {
  return null;
}
}

async function getAuthenticatedActorProfiles(req, adminClient = supabaseAdmin) {
  const authenticatedUserId = await getAuthenticatedUserId(req);

  if (!authenticatedUserId || !adminClient) {
    return {
      authenticatedUserId,
      djProfileId: null,
      venueProfileId: null,
    };
  }

  try {
    const [djResult, venueResult] = await Promise.all([
      adminClient
        .from("dj_profiles")
        .select("id")
        .eq("user_id", authenticatedUserId)
        .maybeSingle(),
      adminClient
        .from("venue_profiles")
        .select("id")
        .eq("user_id", authenticatedUserId)
        .maybeSingle(),
    ]);

    return {
      authenticatedUserId,
      djProfileId: djResult.data?.id ?? null,
      venueProfileId: venueResult.data?.id ?? null,
    };
  } catch {
    return {
      authenticatedUserId,
      djProfileId: null,
      venueProfileId: null,
    };
  }
}

async function withTimeout(promise, ms, label) {
let timeoutId;

const timeoutPromise = new Promise((_, reject) => {
timeoutId = setTimeout(() => reject(new Error(`${label} timeout`)), ms);
});

try {
return await Promise.race([promise, timeoutPromise]);
} finally {
clearTimeout(timeoutId);
}
}

app.get("/health", (_req, res) => {
res.json({ ok: true });
});

async function fetchDjsFromSupabase() {
const fullSelect = `
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
`;

const fallbackSelect = `
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
created_at,
updated_at
`;

let { data, error } = await supabase
.from("dj_profiles")
.select(fullSelect)
.eq("status", "active")
.order("created_at", { ascending: false });

if (error && (hasMissingColumnError(error, "is_verified") || hasMissingColumnError(error, "is_trusted"))) {
({ data, error } = await supabase
  .from("dj_profiles")
  .select(fallbackSelect)
  .eq("status", "active")
  .order("created_at", { ascending: false }));
}

if (error) {
throw error;
}

return data ?? [];
}

async function fetchVenuesFromSupabase() {
let { data, error } = await supabase
.from("venue_profiles")
.select("id, user_id, name, city, type, music_styles, image_url, status, created_at, is_verified, is_trusted")
.eq("status", "active")
.order("created_at", { ascending: false });

if (error && (hasMissingColumnError(error, "is_verified") || hasMissingColumnError(error, "is_trusted"))) {
({ data, error } = await supabase
  .from("venue_profiles")
  .select("id, user_id, name, city, type, music_styles, image_url, status, created_at")
  .eq("status", "active")
  .order("created_at", { ascending: false }));
}

if (error) {
throw error;
}

return data ?? [];
}

async function fetchPostsFromSupabase(filters = {}) {
const baseSelect = "*, venue_profiles(name, image_url)";
const {
id,
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

if (id) {
query = query.eq("id", id);
}

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

async function fetchDjProfileByUserIdFromSupabase(userId) {
const { data, error } = await supabase
  .from("dj_profiles")
  .select("id, user_id")
  .eq("user_id", userId)
  .maybeSingle();
if (error) throw error;
return data ?? null;
}

async function fetchVenueProfileByUserIdFromSupabase(userId) {
const { data, error } = await supabase
  .from("venue_profiles")
  .select("id, user_id")
  .eq("user_id", userId)
  .maybeSingle();
if (error) throw error;
return data ?? null;
}

async function fetchFeedbackFromSupabase() {
const { data, error } = await supabaseAdmin
  .from("feedback")
  .select("id,user_id,type,message,status,admin_note,created_at")
  .order("created_at", { ascending: false });
if (error) throw error;
return data ?? [];
}

async function fetchProfileSummaryFromSupabase(accessToken) {
if (!accessToken) {
return getProfileSummaryFallback();
}

const {
data: { user },
error: userError,
} = await withTimeout(
supabase.auth.getUser(accessToken),
PROFILE_SUMMARY_TIMEOUT_MS,
"profile-summary getUser"
);

if (userError || !user) {
throw userError ?? new Error("Unable to resolve user from token");
}

const [adminRes, djRes, venueRes] = await withTimeout(
Promise.all([
supabase
.from("user_roles")
.select("role")
.eq("user_id", user.id)
.eq("role", "admin")
.maybeSingle(),
supabase
.from("dj_profiles")
.select("*")
.eq("user_id", user.id)
.maybeSingle(),
supabase
.from("venue_profiles")
.select("*")
.eq("user_id", user.id)
.maybeSingle(),
]),
PROFILE_SUMMARY_TIMEOUT_MS,
"profile-summary queries"
);

if (adminRes.error) throw adminRes.error;
if (djRes.error) throw djRes.error;
if (venueRes.error) throw venueRes.error;

return {
isAdmin: !!adminRes.data,
djProfile: djRes.data ?? null,
venueProfile: venueRes.data ?? null,
};
}

function applyEqOrIn(query, column, value) {
if (value === undefined || value === null || value === "") return query;
const values = String(value)
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
if (values.length === 0) return query;
if (values.length === 1) return query.eq(column, values[0]);
return query.in(column, values);
}

async function fetchApplicationsFromSupabase(filters = {}) {
const {
id,
djId,
venueId,
postId,
status,
applicationRound,
} = filters;

let query = supabaseAdmin
  .from("applications")
  .select("*, dj_profiles(id, name, user_id), venue_posts!inner(id, title, post_type, event_date, deadline, start_time, venue_id, venue_profiles(id, name, user_id))")
  .order("created_at", { ascending: false });

if (id) query = query.eq("id", id);
if (djId) query = query.eq("dj_id", djId);
if (postId) query = query.eq("post_id", postId);
if (venueId) query = query.eq("venue_posts.venue_id", venueId);
if (applicationRound !== undefined) query = query.eq("application_round", Number(applicationRound));
query = applyEqOrIn(query, "status", status);

const { data, error } = await query;
if (error) throw error;
return data ?? [];
}

async function fetchInvitationsFromSupabase(filters = {}) {
const {
id,
djId,
venueId,
postId,
status,
applicationRound,
} = filters;

let query = supabaseAdmin
  .from("invitations")
  .select("*, dj_profiles(id, name, user_id), venue_posts(id, title, post_type), venue_profiles(id, name, user_id)")
  .order("created_at", { ascending: false });

if (id) query = query.eq("id", id);
if (djId) query = query.eq("dj_id", djId);
if (venueId) query = query.eq("venue_id", venueId);
if (postId) query = query.eq("post_id", postId);
if (applicationRound !== undefined) query = query.eq("application_round", Number(applicationRound));
query = applyEqOrIn(query, "status", status);

const { data, error } = await query;
if (error) throw error;
return data ?? [];
}

async function fetchBookingsFromSupabase(filters = {}) {
const {
id,
applicationId,
djId,
venueId,
postId,
status,
applicationRound,
} = filters;

let query = supabaseAdmin
  .from("bookings")
  .select("*, applications(application_round), venue_posts(event_date, deadline, start_time, post_type, title, venue_id)")
  .order("created_at", { ascending: false });

if (id) query = query.eq("id", id);
if (applicationId) query = query.eq("application_id", applicationId);
if (djId) query = query.eq("dj_id", djId);
if (venueId) query = query.eq("venue_id", venueId);
if (postId) query = query.eq("post_id", postId);
if (applicationRound !== undefined) query = query.eq("applications.application_round", Number(applicationRound));
query = applyEqOrIn(query, "status", status);

const { data, error } = await query;
if (error) throw error;
return data ?? [];
}

const CHAT_THREAD_SELECT = "id,application_id,booking_id,gig_id,dj_id,venue_id,created_at,updated_at,hidden_by_dj,hidden_by_venue, bookings(status, completed_at), venue_posts(title, event_date, deadline, start_time, post_type), dj_profiles(name), venue_profiles(name)";

async function fetchChatThreadsFromSupabase(filters = {}) {
const {
id,
threadId,
participantKind,
profileId,
djId,
venueId,
bookingId,
applicationId,
} = filters;

let query = supabaseAdmin
  .from("chat_threads")
  .select(CHAT_THREAD_SELECT)
  .order("updated_at", { ascending: false });

if (id || threadId) query = query.eq("id", id ?? threadId);
if (bookingId) query = query.eq("booking_id", bookingId);
if (applicationId) query = query.eq("application_id", applicationId);
if (participantKind === "dj" && profileId) query = query.eq("dj_id", profileId);
if (participantKind === "venue" && profileId) query = query.eq("venue_id", profileId);
if (djId) query = query.eq("dj_id", djId);
if (venueId) query = query.eq("venue_id", venueId);

const { data, error } = await query;
if (error) throw error;
return data ?? [];
}

async function fetchChatMessagesFromSupabase(threadId) {
if (!threadId) return [];

const { data, error } = await supabaseAdmin
  .from("chat_messages")
  .select("*")
  .eq("thread_id", threadId)
  .order("created_at", { ascending: true });

if (error) throw error;
return data ?? [];
}

async function fetchChatPreviewsFromSupabase(threadIds = []) {
if (!Array.isArray(threadIds) || threadIds.length === 0) return [];

const { data, error } = await supabaseAdmin
  .from("chat_messages")
  .select("id, thread_id, sender_id, text, created_at, read_at")
  .in("thread_id", threadIds)
  .order("created_at", { ascending: false })
  .limit(Math.max(threadIds.length * 4, 40));

if (error) throw error;
return data ?? [];
}

async function fetchAcceptedApplicationForBooking(booking) {
if (!booking?.application_id) return null;

const { data, error } = await supabaseAdmin
  .from("applications")
  .select("id, status")
  .eq("id", booking.application_id)
  .eq("status", "accepted")
  .maybeSingle();

if (error || !data) return null;
return data;
}

async function restoreChatThreadVisibility(threadId) {
const { data, error } = await supabaseAdmin
  .from("chat_threads")
  .update({ hidden_by_dj: false, hidden_by_venue: false })
  .eq("id", threadId)
  .select(CHAT_THREAD_SELECT)
  .maybeSingle();

if (error) throw error;
return data ?? null;
}

async function ensureChatThreadForBookingFromSupabase(bookingId) {
const { data: booking, error: bookingError } = await supabaseAdmin
  .from("bookings")
  .select("id, application_id, dj_id, venue_id, post_id")
  .eq("id", bookingId)
  .maybeSingle();

if (bookingError || !booking) {
  throw bookingError ?? new Error("Чат доступен только после создания брони");
}

const acceptedApplication = await fetchAcceptedApplicationForBooking(booking);
if (!acceptedApplication) {
  throw new Error("Чат доступен только после принятия отклика и создания брони");
}

const existingByBooking = (await fetchChatThreadsFromSupabase({ bookingId: booking.id }))[0] ?? null;
if (existingByBooking) {
  if (existingByBooking.hidden_by_dj === true || existingByBooking.hidden_by_venue === true) {
    return await restoreChatThreadVisibility(existingByBooking.id);
  }
  return existingByBooking;
}

const existingByApplication = (await fetchChatThreadsFromSupabase({ applicationId: booking.application_id }))[0] ?? null;
if (existingByApplication) {
  const { data: repaired, error: repairError } = await supabaseAdmin
    .from("chat_threads")
    .update({
      booking_id: existingByApplication.booking_id ?? booking.id,
      hidden_by_dj: false,
      hidden_by_venue: false,
    })
    .eq("id", existingByApplication.id)
    .select(CHAT_THREAD_SELECT)
    .maybeSingle();

  if (repairError) throw repairError;
  return repaired ?? existingByApplication;
}

const { data: inserted, error: insertError } = await supabaseAdmin
  .from("chat_threads")
  .insert({
    application_id: booking.application_id,
    booking_id: booking.id,
    gig_id: booking.post_id,
    dj_id: booking.dj_id,
    venue_id: booking.venue_id,
  })
  .select(CHAT_THREAD_SELECT)
  .single();

if (insertError) {
  if ((insertError.message ?? "").toLowerCase().includes("duplicate")) {
    const retry = (await fetchChatThreadsFromSupabase({ bookingId: booking.id }))[0]
      ?? (await fetchChatThreadsFromSupabase({ applicationId: booking.application_id }))[0]
      ?? null;
    if (retry) return retry;
  }
  throw insertError;
}

return inserted ?? null;
}

async function ensureChatThreadForApplicationFromSupabase(applicationId) {
const { data: application, error: applicationError } = await supabaseAdmin
  .from("applications")
  .select("id, status")
  .eq("id", applicationId)
  .eq("status", "accepted")
  .maybeSingle();

if (applicationError || !application) {
  throw applicationError ?? new Error("Чат доступен только после принятия отклика и создания брони");
}

const { data: booking, error: bookingError } = await supabaseAdmin
  .from("bookings")
  .select("id")
  .eq("application_id", applicationId)
  .maybeSingle();

if (bookingError || !booking) {
  throw bookingError ?? new Error("Чат доступен только после создания брони");
}

return ensureChatThreadForBookingFromSupabase(booking.id);
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
res.json({ ok: true, data: data ?? cache.data ?? [] });
} catch (error) {
if (cache.data) {
  res.json({ ok: true, data: cache.data });
  console.timeEnd(label);
  return;
}

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

app.get("/api/dj-by-id", async (req, res) => {
console.time("api/dj-by-id");

try {
const id = typeof req.query.id === "string" ? req.query.id : "";
if (!id) {
  res.json({ ok: true, data: null });
} else {
  const data = await fetchDjByIdFromSupabase(id);
  res.json({ ok: true, data });
}
} catch (error) {
res.status(500).json({ ok: false, error: error?.message ?? "Unknown proxy error" });
}

console.timeEnd("api/dj-by-id");
});

app.get("/api/dj-profile-by-user", async (req, res) => {
console.time("api/dj-profile-by-user");

try {
const userId = typeof req.query.userId === "string" ? req.query.userId : "";
if (!userId) {
  res.json({ ok: true, data: null });
} else {
  const data = await fetchDjProfileByUserIdFromSupabase(userId);
  res.json({ ok: true, data });
}
} catch (error) {
res.status(500).json({ ok: false, error: error?.message ?? "Unknown proxy error" });
}

console.timeEnd("api/dj-profile-by-user");
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

app.get("/api/venue-profile-by-user", async (req, res) => {
console.time("api/venue-profile-by-user");

try {
const userId = typeof req.query.userId === "string" ? req.query.userId : "";
if (!userId) {
  res.json({ ok: true, data: null });
} else {
  const data = await fetchVenueProfileByUserIdFromSupabase(userId);
  res.json({ ok: true, data });
}
} catch (error) {
res.status(500).json({ ok: false, error: error?.message ?? "Unknown proxy error" });
}

console.timeEnd("api/venue-profile-by-user");
});

app.get("/api/venue-profile-by-id", async (req, res) => {
console.time("api/venue-profile-by-id");

try {
const id = typeof req.query.id === "string" ? req.query.id : "";
if (!id) {
  res.json({ ok: true, data: null });
} else {
  const { data, error } = await supabase
    .from("venue_profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    res.status(500).json({ ok: false, error: error.message });
  } else {
    res.json({ ok: true, data: data ?? null });
  }
}
} catch (error) {
res.status(500).json({ ok: false, error: error?.message ?? "Unknown proxy error" });
}

console.timeEnd("api/venue-profile-by-id");
});

app.patch("/api/dj-profile", async (req, res) => {
console.time("api/dj-profile:patch");

try {
const admin = requireAdminClient(res);
if (!admin) return;
const { userId, id, ...rawUpdates } = req.body ?? {};
const authenticatedUserId = await getAuthenticatedUserId(req);
const updates = pickDefined(rawUpdates, [
  "name",
  "city",
  "contact",
  "styles",
  "priority_style",
  "price",
  "bio",
  "experience",
  "played_at",
  "availability",
  "open_to_collab",
  "open_to_crew",
  "image_url",
  "is_verified",
  "soundcloud",
  "instagram",
]);

if (Object.keys(updates).length === 0) {
  res.status(400).json({ ok: false, error: "No profile fields provided" });
  return;
}

let query = admin
  .from("dj_profiles")
  .update(updates)
  .select("*");

if (authenticatedUserId) query = query.eq("user_id", authenticatedUserId);
else if (userId) query = query.eq("user_id", userId);
else if (id) query = query.eq("id", id);
else {
  res.status(400).json({ ok: false, error: "Missing userId or id" });
  return;
}

const { data, error } = await query.maybeSingle();

if (error) {
  res.status(500).json({ ok: false, error: error.message });
} else if (!data) {
  res.status(404).json({ ok: false, error: "DJ profile not found" });
} else {
  res.json({ ok: true, data });
}
} catch (error) {
res.status(500).json({ ok: false, error: error?.message ?? "Unknown proxy error" });
}

console.timeEnd("api/dj-profile:patch");
});

app.patch("/api/venue-profile", async (req, res) => {
console.time("api/venue-profile:patch");

try {
const admin = requireAdminClient(res);
if (!admin) return;
const { userId, id, ...rawUpdates } = req.body ?? {};
const authenticatedUserId = await getAuthenticatedUserId(req);
const updates = pickDefined(rawUpdates, [
  "name",
  "city",
  "contact",
  "type",
  "description",
  "address",
  "equipment",
  "music_styles",
  "food_drinks",
  "image_url",
  "is_verified",
]);

if (Object.keys(updates).length === 0) {
  res.status(400).json({ ok: false, error: "No profile fields provided" });
  return;
}

let query = admin
  .from("venue_profiles")
  .update(updates)
  .select("*");

if (authenticatedUserId) query = query.eq("user_id", authenticatedUserId);
else if (userId) query = query.eq("user_id", userId);
else if (id) query = query.eq("id", id);
else {
  res.status(400).json({ ok: false, error: "Missing userId or id" });
  return;
}

const { data, error } = await query.maybeSingle();

if (error) {
  res.status(500).json({ ok: false, error: error.message });
} else if (!data) {
  res.status(404).json({ ok: false, error: "Venue profile not found" });
} else {
  res.json({ ok: true, data });
}
} catch (error) {
res.status(500).json({ ok: false, error: error?.message ?? "Unknown proxy error" });
}

console.timeEnd("api/venue-profile:patch");
});

app.get("/api/posts", async (req, res) => {
const filters = {
id: typeof req.query.id === "string" ? req.query.id : undefined,
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

app.get("/api/venue-posts", async (req, res) => {
console.time("api/venue-posts");

const filters = {
id: typeof req.query.id === "string" ? req.query.id : undefined,
venueId: typeof req.query.venueId === "string" ? req.query.venueId : undefined,
status: typeof req.query.status === "string" ? req.query.status : undefined,
postType: typeof req.query.postType === "string" ? req.query.postType : undefined,
city: typeof req.query.city === "string" ? req.query.city : undefined,
style: typeof req.query.style === "string" ? req.query.style : undefined,
};

try {
const data = await fetchPostsFromSupabase(filters);
res.json({ ok: true, data });
} catch (error) {
res.status(500).json({
ok: false,
error: error?.message ?? "Unknown proxy error",
});
}

console.timeEnd("api/venue-posts");
});

app.post("/api/venue-posts", async (req, res) => {
console.time("api/venue-posts:post");

try {
const admin = requireAdminClient(res);
if (!admin) return;
const payload = pickDefined(req.body ?? {}, [
  "venue_id",
  "title",
  "city",
  "description",
  "budget",
  "music_styles",
  "post_type",
  "status",
  "event_date",
  "start_time",
  "duration",
  "requirements",
  "portfolio_required",
  "deadline",
  "schedule",
  "frequency",
  "long_term",
  "application_round",
  "moderation_status",
]);

const actor = await getAuthenticatedActorProfiles(req, admin);
if (actor.venueProfileId) {
  payload.venue_id = actor.venueProfileId;
}

if (!isNonEmptyString(payload.venue_id) || !isNonEmptyString(payload.title) || !isNonEmptyString(payload.city)) {
  res.status(400).json({ ok: false, error: "venue_id, title and city are required" });
  return;
}

  const { data, error } = await admin
  .from("venue_posts")
  .insert(payload)
  .select("*, venue_profiles(name, image_url)")
  .single();

if (error) {
  res.status(500).json({ ok: false, error: error.message });
} else if (!data) {
  res.status(404).json({ ok: false, error: "Venue post was not created" });
} else {
  postsCache.data = null;
  postsCache.expiresAt = 0;
  res.json({ ok: true, data });
}
} catch (error) {
res.status(500).json({ ok: false, error: error?.message ?? "Unknown proxy error" });
}

console.timeEnd("api/venue-posts:post");
});

app.get("/api/applications", async (req, res) => {
console.time("api/applications");

const filters = {
id: typeof req.query.id === "string" ? req.query.id : undefined,
djId: typeof req.query.djId === "string" ? req.query.djId : undefined,
venueId: typeof req.query.venueId === "string" ? req.query.venueId : undefined,
postId: typeof req.query.postId === "string" ? req.query.postId : undefined,
status: typeof req.query.status === "string" ? req.query.status : undefined,
applicationRound: typeof req.query.applicationRound === "string" ? req.query.applicationRound : undefined,
};

try {
const data = await fetchApplicationsFromSupabase(filters);
res.json({ ok: true, data });
} catch (error) {
res.status(500).json({ ok: false, error: error?.message ?? "Unknown proxy error" });
}

console.timeEnd("api/applications");
});

app.post("/api/applications", async (req, res) => {
console.time("api/applications:post");

try {
const admin = requireAdminClient(res);
if (!admin) return;
const payload = pickDefined(req.body ?? {}, [
  "dj_id",
  "post_id",
  "message",
  "status",
  "application_round",
  "hidden_for_dj",
  "hidden_for_venue",
]);

const actor = await getAuthenticatedActorProfiles(req, admin);
if (actor.djProfileId) {
  payload.dj_id = actor.djProfileId;
}

if (!isNonEmptyString(payload.dj_id) || !isNonEmptyString(payload.post_id)) {
  res.status(400).json({ ok: false, error: "dj_id and post_id are required" });
  return;
}

if (!payload.status) payload.status = "new";

  const { data, error } = await admin
  .from("applications")
  .insert(payload)
  .select("*, dj_profiles(id, name, user_id), venue_posts!inner(id, title, post_type, event_date, deadline, start_time, venue_id, venue_profiles(id, name, user_id))")
  .single();

if (error) {
  res.status(500).json({ ok: false, error: error.message });
} else if (!data) {
  res.status(404).json({ ok: false, error: "Application was not created" });
} else {
  res.json({ ok: true, data });
}
} catch (error) {
res.status(500).json({ ok: false, error: error?.message ?? "Unknown proxy error" });
}

console.timeEnd("api/applications:post");
});

app.patch("/api/applications/:id", async (req, res) => {
console.time("api/applications:patch");

try {
const admin = requireAdminClient(res);
if (!admin) return;
const payload = {
  ...pickDefined(req.body ?? {}, [
  "status",
  "hidden_by_dj",
  "hidden_by_venue",
  "message",
  "application_round",
  ]),
  ...(Object.prototype.hasOwnProperty.call(req.body ?? {}, "hiddenByDj")
    ? { hidden_by_dj: req.body.hiddenByDj }
    : {}),
  ...(Object.prototype.hasOwnProperty.call(req.body ?? {}, "hiddenByVenue")
    ? { hidden_by_venue: req.body.hiddenByVenue }
    : {}),
};

if (Object.keys(payload).length === 0) {
  res.status(400).json({ ok: false, error: "No application fields provided" });
  return;
}

const { data, error } = await admin
  .from("applications")
  .update(payload)
  .eq("id", req.params.id)
  .select("*, dj_profiles(id, name, user_id), venue_posts!inner(id, title, post_type, event_date, deadline, start_time, venue_id, venue_profiles(id, name, user_id))")
  .maybeSingle();

if (error) {
  res.status(500).json({ ok: false, error: error.message });
} else if (!data) {
  res.status(404).json({ ok: false, error: "Application was not found" });
} else {
  res.json({ ok: true, data });
}
} catch (error) {
res.status(500).json({ ok: false, error: error?.message ?? "Unknown proxy error" });
}

console.timeEnd("api/applications:patch");
});

app.get("/api/invitations", async (req, res) => {
console.time("api/invitations");

const filters = {
id: typeof req.query.id === "string" ? req.query.id : undefined,
djId: typeof req.query.djId === "string" ? req.query.djId : undefined,
venueId: typeof req.query.venueId === "string" ? req.query.venueId : undefined,
postId: typeof req.query.postId === "string" ? req.query.postId : undefined,
status: typeof req.query.status === "string" ? req.query.status : undefined,
applicationRound: typeof req.query.applicationRound === "string" ? req.query.applicationRound : undefined,
};

try {
const data = await fetchInvitationsFromSupabase(filters);
res.json({ ok: true, data });
} catch (error) {
res.status(500).json({ ok: false, error: error?.message ?? "Unknown proxy error" });
}

console.timeEnd("api/invitations");
});

app.post("/api/invitations", async (req, res) => {
console.time("api/invitations:post");

try {
const admin = requireAdminClient(res);
if (!admin) return;
const payload = pickDefined(req.body ?? {}, [
  "venue_id",
  "dj_id",
  "post_id",
  "message",
  "status",
  "application_round",
]);

const actor = await getAuthenticatedActorProfiles(req, admin);
if (actor.venueProfileId) {
  payload.venue_id = actor.venueProfileId;
}

if (!isNonEmptyString(payload.venue_id) || !isNonEmptyString(payload.dj_id) || !isNonEmptyString(payload.post_id)) {
  res.status(400).json({ ok: false, error: "venue_id, dj_id and post_id are required" });
  return;
}

if (!payload.status) payload.status = "new";

  const { data, error } = await admin
  .from("invitations")
  .insert(payload)
  .select("*, dj_profiles(id, name, user_id), venue_posts(id, title, post_type), venue_profiles(id, name, user_id)")
  .single();

if (error) {
  res.status(500).json({ ok: false, error: error.message });
} else if (!data) {
  res.status(404).json({ ok: false, error: "Invitation was not created" });
} else {
  res.json({ ok: true, data });
}
} catch (error) {
res.status(500).json({ ok: false, error: error?.message ?? "Unknown proxy error" });
}

console.timeEnd("api/invitations:post");
});

app.patch("/api/invitations/:id", async (req, res) => {
console.time("api/invitations:patch");

try {
const admin = requireAdminClient(res);
if (!admin) return;
const payload = pickDefined(req.body ?? {}, [
  "status",
  "message",
  "application_round",
]);

if (Object.keys(payload).length === 0) {
  res.status(400).json({ ok: false, error: "No invitation fields provided" });
  return;
}

const { data, error } = await admin
  .from("invitations")
  .update(payload)
  .eq("id", req.params.id)
  .select("*, dj_profiles(id, name, user_id), venue_posts(id, title, post_type), venue_profiles(id, name, user_id)")
  .maybeSingle();

if (error) {
  res.status(500).json({ ok: false, error: error.message });
} else if (!data) {
  res.status(404).json({ ok: false, error: "Invitation was not found" });
} else {
  res.json({ ok: true, data });
}
} catch (error) {
res.status(500).json({ ok: false, error: error?.message ?? "Unknown proxy error" });
}

console.timeEnd("api/invitations:patch");
});

app.get("/api/bookings", async (req, res) => {
console.time("api/bookings");

const filters = {
id: typeof req.query.id === "string" ? req.query.id : undefined,
applicationId: typeof req.query.applicationId === "string" ? req.query.applicationId : undefined,
djId: typeof req.query.djId === "string" ? req.query.djId : undefined,
venueId: typeof req.query.venueId === "string" ? req.query.venueId : undefined,
postId: typeof req.query.postId === "string" ? req.query.postId : undefined,
status: typeof req.query.status === "string" ? req.query.status : undefined,
applicationRound: typeof req.query.applicationRound === "string" ? req.query.applicationRound : undefined,
};

try {
const data = await fetchBookingsFromSupabase(filters);
res.json({ ok: true, data });
} catch (error) {
res.status(500).json({ ok: false, error: error?.message ?? "Unknown proxy error" });
}

console.timeEnd("api/bookings");
});

app.get("/api/chat-threads", async (req, res) => {
console.time("api/chat-threads");

const filters = {
id: typeof req.query.id === "string" ? req.query.id : undefined,
threadId: typeof req.query.threadId === "string" ? req.query.threadId : undefined,
participantKind: typeof req.query.participantKind === "string" ? req.query.participantKind : undefined,
profileId: typeof req.query.profileId === "string" ? req.query.profileId : undefined,
djId: typeof req.query.djId === "string" ? req.query.djId : undefined,
venueId: typeof req.query.venueId === "string" ? req.query.venueId : undefined,
bookingId: typeof req.query.bookingId === "string" ? req.query.bookingId : undefined,
applicationId: typeof req.query.applicationId === "string" ? req.query.applicationId : undefined,
};

try {
const data = await fetchChatThreadsFromSupabase(filters);
res.json({ ok: true, data });
} catch (error) {
res.status(500).json({ ok: false, error: error?.message ?? "Unknown proxy error" });
}

console.timeEnd("api/chat-threads");
});

app.post("/api/chat-threads/ensure-booking", async (req, res) => {
console.time("api/chat-threads:ensure-booking");

try {
const admin = requireAdminClient(res);
if (!admin) return;
const bookingId = typeof req.body?.bookingId === "string" ? req.body.bookingId : "";
if (!bookingId) {
  res.status(400).json({ ok: false, error: "bookingId is required" });
} else {
  const data = await ensureChatThreadForBookingFromSupabase(bookingId);
  res.json({ ok: true, data });
}
} catch (error) {
res.status(500).json({ ok: false, error: error?.message ?? "Unknown proxy error" });
}

console.timeEnd("api/chat-threads:ensure-booking");
});

app.post("/api/chat-threads/ensure-application", async (req, res) => {
console.time("api/chat-threads:ensure-application");

try {
const admin = requireAdminClient(res);
if (!admin) return;
const applicationId = typeof req.body?.applicationId === "string" ? req.body.applicationId : "";
if (!applicationId) {
  res.status(400).json({ ok: false, error: "applicationId is required" });
} else {
  const data = await ensureChatThreadForApplicationFromSupabase(applicationId);
  res.json({ ok: true, data });
}
} catch (error) {
res.status(500).json({ ok: false, error: error?.message ?? "Unknown proxy error" });
}

console.timeEnd("api/chat-threads:ensure-application");
});

app.patch("/api/chat-threads/:id", async (req, res) => {
console.time("api/chat-threads:patch");

try {
const admin = requireAdminClient(res);
if (!admin) return;
const allowedUpdates = {};
["hidden_by_dj", "hidden_by_venue", "updated_at", "booking_id"].forEach((key) => {
  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, key)) {
    allowedUpdates[key] = req.body[key];
  }
});

const { data, error } = await admin
  .from("chat_threads")
  .update(allowedUpdates)
  .eq("id", req.params.id)
  .select(CHAT_THREAD_SELECT)
  .maybeSingle();

if (error) {
  res.status(500).json({ ok: false, error: error.message });
} else if (!data) {
  res.status(404).json({ ok: false, error: "Chat thread was not found" });
} else {
  res.json({ ok: true, data });
}
} catch (error) {
res.status(500).json({ ok: false, error: error?.message ?? "Unknown proxy error" });
}

console.timeEnd("api/chat-threads:patch");
});

app.get("/api/chat-messages", async (req, res) => {
console.time("api/chat-messages");

try {
const threadId = typeof req.query.threadId === "string" ? req.query.threadId : "";
const data = await fetchChatMessagesFromSupabase(threadId);
res.json({ ok: true, data });
} catch (error) {
res.status(500).json({ ok: false, error: error?.message ?? "Unknown proxy error" });
}

console.timeEnd("api/chat-messages");
});

app.get("/api/chat-previews", async (req, res) => {
console.time("api/chat-previews");

try {
const rawThreadIds = typeof req.query.threadIds === "string" ? req.query.threadIds : "";
const threadIds = rawThreadIds.split(",").map((value) => value.trim()).filter(Boolean);
const data = await fetchChatPreviewsFromSupabase(threadIds);
res.json({ ok: true, data });
} catch (error) {
res.status(500).json({ ok: false, error: error?.message ?? "Unknown proxy error" });
}

console.timeEnd("api/chat-previews");
});

app.post("/api/chat-messages", async (req, res) => {
console.time("api/chat-messages:post");

try {
const admin = requireAdminClient(res);
if (!admin) return;
const actor = await getAuthenticatedActorProfiles(req, admin);
const payload = {
  thread_id: typeof req.body?.thread_id === "string" ? req.body.thread_id : "",
  sender_id: typeof req.body?.sender_id === "string" ? req.body.sender_id : "",
  text: typeof req.body?.text === "string" ? req.body.text.slice(0, 1000) : "",
};

if (actor.djProfileId && actor.venueProfileId) {
  if (payload.sender_id !== actor.djProfileId && payload.sender_id !== actor.venueProfileId) {
    res.status(403).json({ ok: false, error: "sender_id does not match authenticated profile" });
    return;
  }
} else if (actor.djProfileId && payload.sender_id !== actor.djProfileId) {
  res.status(403).json({ ok: false, error: "sender_id does not match authenticated DJ profile" });
  return;
} else if (actor.venueProfileId && payload.sender_id !== actor.venueProfileId) {
  res.status(403).json({ ok: false, error: "sender_id does not match authenticated venue profile" });
  return;
}

if (!payload.thread_id || !payload.sender_id || !payload.text.trim()) {
  res.status(400).json({ ok: false, error: "thread_id, sender_id and text are required" });
} else {
  const { data, error } = await admin
    .from("chat_messages")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    res.status(500).json({ ok: false, error: error.message });
  } else if (!data) {
    res.status(404).json({ ok: false, error: "Chat message was not created" });
  } else {
    await admin
      .from("chat_threads")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", payload.thread_id);
    res.json({ ok: true, data });
  }
}
} catch (error) {
res.status(500).json({ ok: false, error: error?.message ?? "Unknown proxy error" });
}

console.timeEnd("api/chat-messages:post");
});

app.patch("/api/chat-messages/read", async (req, res) => {
console.time("api/chat-messages:read");

try {
const admin = requireAdminClient(res);
if (!admin) return;
const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((value) => typeof value === "string" && value) : [];
const readAt = typeof req.body?.read_at === "string" ? req.body.read_at : new Date().toISOString();

if (ids.length === 0) {
  res.json({ ok: true, data: [] });
} else {
  const { data, error } = await admin
    .from("chat_messages")
    .update({ read_at: readAt })
    .in("id", ids)
    .select("id, thread_id, sender_id, text, created_at, read_at");

  if (error) {
    res.status(500).json({ ok: false, error: error.message });
  } else {
    res.json({ ok: true, data: data ?? [] });
  }
}
} catch (error) {
res.status(500).json({ ok: false, error: error?.message ?? "Unknown proxy error" });
}

console.timeEnd("api/chat-messages:read");
});

app.post("/api/bookings", async (req, res) => {
console.time("api/bookings:post");

try {
const admin = requireAdminClient(res);
if (!admin) return;
const payload = pickDefined(req.body ?? {}, [
  "application_id",
  "dj_id",
  "venue_id",
  "post_id",
  "status",
  "confirmed_at",
  "completed_at",
  "cancelled_at",
]);

const actor = await getAuthenticatedActorProfiles(req, admin);
if (actor.djProfileId && !payload.dj_id) {
  payload.dj_id = actor.djProfileId;
}
if (actor.venueProfileId && !payload.venue_id) {
  payload.venue_id = actor.venueProfileId;
}

if (!isNonEmptyString(payload.application_id) || !isNonEmptyString(payload.dj_id) || !isNonEmptyString(payload.venue_id)) {
  res.status(400).json({ ok: false, error: "application_id, dj_id and venue_id are required" });
  return;
}

  const { data, error } = await admin
  .from("bookings")
  .insert(payload)
  .select("*")
  .single();

if (error) {
  res.status(500).json({ ok: false, error: error.message });
} else if (!data) {
  res.status(404).json({ ok: false, error: "Booking was not created" });
} else {
  res.json({ ok: true, data });
}
} catch (error) {
res.status(500).json({ ok: false, error: error?.message ?? "Unknown proxy error" });
}

console.timeEnd("api/bookings:post");
});

app.patch("/api/bookings/:id", async (req, res) => {
console.time("api/bookings:patch");

try {
const admin = requireAdminClient(res);
if (!admin) return;
const payload = pickDefined(req.body ?? {}, [
  "status",
  "confirmed_at",
  "completed_at",
  "cancelled_at",
]);

if (Object.keys(payload).length === 0) {
  res.status(400).json({ ok: false, error: "No booking fields provided" });
  return;
}

const { data, error } = await admin
  .from("bookings")
  .update(payload)
  .eq("id", req.params.id)
  .select("*, venue_posts(event_date, deadline, start_time, post_type, title)")
  .maybeSingle();

if (error) {
  res.status(500).json({ ok: false, error: error.message });
} else if (!data) {
  res.status(404).json({ ok: false, error: "Booking was not found" });
} else {
  res.json({ ok: true, data });
}
} catch (error) {
res.status(500).json({ ok: false, error: error?.message ?? "Unknown proxy error" });
}

console.timeEnd("api/bookings:patch");
});

app.patch("/api/venue-posts/:id", async (req, res) => {
console.time("api/venue-posts:patch");

try {
const admin = requireAdminClient(res);
if (!admin) return;
const payload = pickDefined(req.body ?? {}, [
  "title",
  "city",
  "description",
  "budget",
  "music_styles",
  "post_type",
  "status",
  "event_date",
  "start_time",
  "duration",
  "requirements",
  "portfolio_required",
  "deadline",
  "schedule",
  "frequency",
  "long_term",
  "application_round",
  "moderation_status",
]);

const actor = await getAuthenticatedActorProfiles(req, admin);
let query = admin
  .from("venue_posts")
  .update(payload)
  .eq("id", req.params.id);

if (actor.venueProfileId) {
  query = query.eq("venue_id", actor.venueProfileId);
}

if (Object.keys(payload).length === 0) {
  res.status(400).json({ ok: false, error: "No venue post fields provided" });
  return;
}

const { data, error } = await query
  .select("*, venue_profiles(name, image_url)")
  .maybeSingle();

if (error) {
  res.status(500).json({ ok: false, error: error.message });
} else if (!data) {
  res.status(404).json({ ok: false, error: "Venue post was not found" });
} else {
  postsCache.data = null;
  postsCache.expiresAt = 0;
  res.json({ ok: true, data });
}
} catch (error) {
res.status(500).json({ ok: false, error: error?.message ?? "Unknown proxy error" });
}

console.timeEnd("api/venue-posts:patch");
});

app.delete("/api/venue-posts/:id/archive-cleanup", async (req, res) => {
console.time("api/venue-posts:archive-cleanup");

try {
const admin = requireAdminClient(res);
if (!admin) return;
const actor = await getAuthenticatedActorProfiles(req, admin);

if (actor.venueProfileId) {
  const { data: ownedPost, error: ownedPostError } = await admin
    .from("venue_posts")
    .select("id")
    .eq("id", req.params.id)
    .eq("venue_id", actor.venueProfileId)
    .maybeSingle();

  if (ownedPostError) {
    res.status(500).json({ ok: false, error: ownedPostError.message });
    return;
  }

  if (!ownedPost) {
    res.status(404).json({ ok: false, error: "Venue post was not found" });
    return;
  }
}

const { error } = await admin.rpc("delete_archived_venue_post", { post_uuid: req.params.id });

if (error) {
  res.status(500).json({ ok: false, error: error.message });
} else {
  postsCache.data = null;
  postsCache.expiresAt = 0;
  res.json({ ok: true, data: { deleted: true } });
}
} catch (error) {
res.status(500).json({ ok: false, error: error?.message ?? "Unknown proxy error" });
}

console.timeEnd("api/venue-posts:archive-cleanup");
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

app.get("/api/feedback", async (_req, res) => {
console.time("api/feedback");

try {
const data = await fetchFeedbackFromSupabase();
res.json({ ok: true, data });
} catch (error) {
res.status(500).json({ ok: false, error: error?.message ?? "Unknown proxy error" });
}

console.timeEnd("api/feedback");
});

app.post("/api/feedback", async (req, res) => {
console.time("api/feedback:post");

try {
const { data, error } = await supabaseAdmin
  .from("feedback")
  .insert(req.body)
  .select("id")
  .single();

if (error) {
  res.status(500).json({ ok: false, error: error.message });
} else {
  res.json({ ok: true, data });
}
} catch (error) {
res.status(500).json({ ok: false, error: error?.message ?? "Unknown proxy error" });
}

console.timeEnd("api/feedback:post");
});

app.patch("/api/feedback/:id", async (req, res) => {
console.time("api/feedback:patch");

try {
const { data, error } = await supabaseAdmin
  .from("feedback")
  .update(req.body)
  .eq("id", req.params.id)
  .select("id, status")
  .maybeSingle();

if (error) {
  res.status(500).json({ ok: false, error: error.message });
} else {
  res.json({ ok: true, data });
}
} catch (error) {
res.status(500).json({ ok: false, error: error?.message ?? "Unknown proxy error" });
}

console.timeEnd("api/feedback:patch");
});

app.get("/api/me/profile-summary", async (req, res) => {
const label = "api/me/profile-summary";
console.time(label);
try {
  const accessToken = getBearerToken(req);

  if (!accessToken) {
    res.json({
      ok: true,
      data: getProfileSummaryFallback(),
    });
    return;
  }

  const data = await withTimeout(
    fetchProfileSummaryFromSupabase(accessToken),
    PROFILE_SUMMARY_TIMEOUT_MS,
    "api/me/profile-summary"
  );

  res.json({ ok: true, data });
} catch (error) {
  console.warn("[proxy] profile-summary fallback", error?.message ?? error);
  res.status(200).json({
    ok: false,
    error: error?.message ?? "Unknown proxy error",
    data: null,
  });
} finally {
  console.timeEnd(label);
}
});

app.listen(port, () => {
console.log(`DJHUB backend proxy listening on http://localhost:${port}`);

void warmCache("api/djs", djsCache, fetchDjsFromSupabase).catch(() => {});
void warmCache("api/venues", venuesCache, fetchVenuesFromSupabase).catch(() => {});
void warmCache("api/posts", postsCache, fetchPostsFromSupabase, POSTS_CACHE_TTL).catch(() => {});
});
