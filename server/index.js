import "dotenv/config";
import express from "express";
import { createClient } from "@supabase/supabase-js";

const app = express();
const port = Number(process.env.PORT || 3001);
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const CACHE_TTL = 5 * 60 * 1000;
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
    .select("id, user_id, name, city, image_url, styles, priority_style, price, experience, status, is_verified, is_trusted, created_at")
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

async function fetchPostsFromSupabase() {
  const baseSelect = "id, venue_id, title, city, description, budget, music_styles, post_type, status, event_date, deadline, start_time, duration, frequency, created_at, venue_profiles(name, image_url)";
  let query = supabase
    .from("venue_posts")
    .select(baseSelect)
    .eq("status", "open")
    .order("created_at", { ascending: false });

  let data;
  let error;

  ({ data, error } = await query.eq("moderation_status", "active"));

  if (error && String(error.message ?? "").toLowerCase().includes("moderation_status")) {
    ({ data, error } = await supabase
      .from("venue_posts")
      .select(baseSelect)
      .eq("status", "open")
      .order("created_at", { ascending: false }));
  }

  if (error) {
    throw error;
  }

  return data ?? [];
}

function isFresh(cache) {
  return cache.data && cache.expiresAt > Date.now();
}

async function warmCache(label, cache, loader) {
  if (cache.promise) return cache.promise;

  cache.promise = loader()
    .then((data) => {
      cache.data = data;
      cache.expiresAt = Date.now() + CACHE_TTL;
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

function refreshInBackground(label, cache, loader) {
  if (cache.promise) return;

  cache.promise = loader()
    .then((data) => {
      cache.data = data;
      cache.expiresAt = Date.now() + CACHE_TTL;
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

async function handleCachedCollection(req, res, label, cache, loader) {
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
    refreshInBackground(label, cache, loader);
    return;
  }

  console.log(`[proxy] cache miss: ${label}`);
  try {
    const data = await warmCache(label, cache, loader);
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

app.get("/api/venues", async (req, res) => {
  await handleCachedCollection(req, res, "api/venues", venuesCache, fetchVenuesFromSupabase);
});

app.get("/api/posts", async (req, res) => {
  await handleCachedCollection(req, res, "api/posts", postsCache, fetchPostsFromSupabase);
});

app.listen(port, () => {
  console.log(`DJHUB backend proxy listening on http://localhost:${port}`);
  void warmCache("api/djs", djsCache, fetchDjsFromSupabase).catch(() => {});
  void warmCache("api/venues", venuesCache, fetchVenuesFromSupabase).catch(() => {});
  void warmCache("api/posts", postsCache, fetchPostsFromSupabase).catch(() => {});
});
