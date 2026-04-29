import { supabase } from "@/integrations/supabase/client";
import { mapDjToDb, mapDjToLocalStorage, type DjProfileModel } from "@/lib/djProfile";
import { mapVenueToDb, mapVenueToLocalStorage, mergeVenueProfile, type VenueProfileModel } from "@/lib/venueProfile";
import { isDjProfileComplete, isVenueProfileComplete } from "@/domains/profiles/verification.rules";

const CURRENT_DJ_PROFILE_KEY = "djhub_dj_profile";
const CURRENT_VENUE_PROFILE_KEY = "djhub_venue_profile";
const API_URL = import.meta.env.VITE_API_URL;
const REQUEST_TIMEOUT_MS = 6000;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function getCurrentDjProfile(): DjProfileModel | null {
  return readJson<DjProfileModel | null>(CURRENT_DJ_PROFILE_KEY, null);
}

function getCurrentVenueProfile(): VenueProfileModel | null {
  return readJson<VenueProfileModel | null>(CURRENT_VENUE_PROFILE_KEY, null);
}

async function patchProfile<TProfile>(
  url: string,
  body: Record<string, unknown>,
): Promise<TProfile> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const response = await fetch(`${API_URL}${url}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null) as {
      ok?: boolean;
      data?: TProfile | null;
      error?: string;
    } | null;

    if (!response.ok || !payload?.ok || !payload.data) {
      throw new Error(payload?.error || `Profile update failed with status ${response.status}`);
    }

    return payload.data;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function updateDjProfile(updates: Partial<DjProfileModel>): Promise<DjProfileModel | null> {
  const profile = getCurrentDjProfile();
  if (!profile) return null;

  const mergedProfile = {
    ...profile,
    ...updates,
    styles: updates.styles ?? profile.styles ?? [],
    bio: updates.bio ?? profile.bio ?? "",
    description: updates.bio ?? profile.bio ?? "",
    image: updates.image ?? profile.image ?? null,
    avatar: updates.image ?? profile.image ?? null,
    image_url: updates.image ?? profile.image ?? null,
    playedAt: updates.playedAt ?? profile.playedAt ?? [],
    priorityStyle: updates.priorityStyle ?? profile.priorityStyle ?? "",
    priority_style: updates.priorityStyle ?? profile.priorityStyle ?? "",
    openToCollab: updates.openToCollab ?? profile.openToCollab ?? false,
    openToCrew: updates.openToCrew ?? profile.openToCrew ?? false,
  } as DjProfileModel;
  const verifiedUpdates = { ...updates, is_verified: isDjProfileComplete(mergedProfile) } as Partial<DjProfileModel>;

  await patchProfile("/api/dj-profile", {
    id: profile.id,
    userId: profile.user_id,
    ...mapDjToDb(verifiedUpdates),
  });

  const updated = mapDjToLocalStorage({ ...mergedProfile, is_verified: verifiedUpdates.is_verified } as DjProfileModel);
  localStorage.setItem(CURRENT_DJ_PROFILE_KEY, JSON.stringify(updated));
  return updated;
}

export async function updateVenueProfile(updates: Partial<VenueProfileModel>): Promise<VenueProfileModel | null> {
  const profile = getCurrentVenueProfile();
  if (!profile) return null;

  const mergedProfile = mergeVenueProfile(profile, updates);
  const verifiedUpdates = { ...updates, is_verified: isVenueProfileComplete(mergedProfile) } as Partial<VenueProfileModel>;

  await patchProfile("/api/venue-profile", {
    id: profile.id,
    userId: profile.user_id,
    ...mapVenueToDb(verifiedUpdates),
  });

  const updated = mapVenueToLocalStorage(mergeVenueProfile(profile, verifiedUpdates));
  localStorage.setItem(CURRENT_VENUE_PROFILE_KEY, JSON.stringify(updated));
  return updated;
}
