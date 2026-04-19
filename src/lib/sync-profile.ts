import { supabase } from "@/integrations/supabase/client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(id: string): boolean {
  return UUID_RE.test(id);
}

/** If venue profile has a non-UUID id, push it to Supabase and update localStorage with real UUID */
export async function syncVenueProfileIfNeeded(): Promise<boolean> {
  try {
    const raw = localStorage.getItem("djhub_venue_profile");
    if (!raw) return false;
    const profile = JSON.parse(raw);
    if (isValidUuid(profile.id)) return false;

    const { data, error } = await supabase.from("venue_profiles").insert({
      name: profile.name,
      city: profile.city,
      type: profile.type,
      contact: profile.contact,
      music_styles: profile.music || profile.music_styles || [],
      description: profile.description || null,
      equipment: profile.equipment || null,
      address: profile.address || null,
      food_drinks: profile.foodDrinks || profile.food_drinks || null,
      image_url: profile.image_url || profile.image || null,
    }).select("id").single();

    if (error || !data) {
      console.warn("Sync venue profile failed:", error?.message);
      return false;
    }

    const oldId = profile.id;
    profile.id = data.id;
    localStorage.setItem("djhub_venue_profile", JSON.stringify(profile));

    // Update registered venues list too
    try {
      const regRaw = localStorage.getItem("djhub_registered_venues");
      if (regRaw) {
        const arr = JSON.parse(regRaw);
        const updated = arr.map((v: any) => v.id === oldId ? { ...v, id: data.id } : v);
        localStorage.setItem("djhub_registered_venues", JSON.stringify(updated));
      }
    } catch { /* ignore */ }

    return true;
  } catch {
    return false;
  }
}

/** Same for DJ profile */
export async function syncDjProfileIfNeeded(): Promise<boolean> {
  try {
    const raw = localStorage.getItem("djhub_dj_profile");
    if (!raw) return false;
    const profile = JSON.parse(raw);
    if (isValidUuid(profile.id)) return false;

    const { data, error } = await supabase.from("dj_profiles").insert({
      name: profile.name,
      city: profile.city,
      contact: profile.contact,
      styles: profile.styles || [],
      priority_style: profile.priorityStyle || profile.styles?.[0] || null,
      price: profile.price,
      bio: profile.bio || null,
      experience: profile.experience || null,
      played_at: profile.playedAt || [],
      availability: profile.availability || null,
      format: null,
      open_to_collab: profile.openToCollab || false,
      open_to_crew: profile.openToCrew || false,
      soundcloud: profile.socials?.find((s: any) => s.label === "SoundCloud")?.url || null,
      instagram: profile.socials?.find((s: any) => s.label === "Instagram")?.url || null,
      image_url: profile.image_url || profile.image || null,
    }).select("id").single();

    if (error || !data) {
      console.warn("Sync DJ profile failed:", error?.message);
      return false;
    }

    const oldId = profile.id;
    profile.id = data.id;
    localStorage.setItem("djhub_dj_profile", JSON.stringify(profile));

    try {
      const regRaw = localStorage.getItem("djhub_registered_djs");
      if (regRaw) {
        const arr = JSON.parse(regRaw);
        const updated = arr.map((d: any) => d.id === oldId ? { ...d, id: data.id } : d);
        localStorage.setItem("djhub_registered_djs", JSON.stringify(updated));
      }
    } catch { /* ignore */ }

    return true;
  } catch {
    return false;
  }
}
