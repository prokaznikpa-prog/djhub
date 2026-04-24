import { supabase } from "@/integrations/supabase/client";
import { mapDjToDb, mapDjToLocalStorage, type DjProfileModel } from "@/lib/djProfile";
import { mapVenueToDb, mapVenueToLocalStorage, mergeVenueProfile, type VenueProfileModel } from "@/lib/venueProfile";
import { isDjProfileComplete, isVenueProfileComplete } from "@/domains/profiles/verification.rules";

const CURRENT_DJ_PROFILE_KEY = "djhub_dj_profile";
const CURRENT_VENUE_PROFILE_KEY = "djhub_venue_profile";

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

  const { error } = await supabase
    .from("dj_profiles")
    .update(mapDjToDb(verifiedUpdates))
    .eq("id", profile.id);

  if (error) {
    console.error("Supabase update error:", error);
    throw error;
  }

  const updated = mapDjToLocalStorage({ ...mergedProfile, is_verified: verifiedUpdates.is_verified } as DjProfileModel);
  localStorage.setItem(CURRENT_DJ_PROFILE_KEY, JSON.stringify(updated));
  return updated;
}

export async function updateVenueProfile(updates: Partial<VenueProfileModel>): Promise<VenueProfileModel | null> {
  const profile = getCurrentVenueProfile();
  if (!profile) return null;

  const mergedProfile = mergeVenueProfile(profile, updates);
  const verifiedUpdates = { ...updates, is_verified: isVenueProfileComplete(mergedProfile) } as Partial<VenueProfileModel>;

  const { error } = await supabase
    .from("venue_profiles")
    .update(mapVenueToDb(verifiedUpdates))
    .eq("id", profile.id);

  if (error) {
    console.error("Supabase venue update error:", error);
    throw error;
  }

  const updated = mapVenueToLocalStorage(mergeVenueProfile(profile, verifiedUpdates));
  localStorage.setItem(CURRENT_VENUE_PROFILE_KEY, JSON.stringify(updated));
  return updated;
}
