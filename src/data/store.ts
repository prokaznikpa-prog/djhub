import type { DJ, Venue, Gig } from "@/data/djhub-data";
import { supabase } from "@/integrations/supabase/client";
import { mapDjToDb, mapDjToLocalStorage, type DjProfileModel } from "@/lib/djProfile";
import { mapVenueToDb, mapVenueToLocalStorage, mergeVenueProfile, type VenueProfileModel } from "@/lib/venueProfile";
const DJ_STORAGE_KEY = "djhub_registered_djs";
const VENUE_STORAGE_KEY = "djhub_registered_venues";
const GIGS_STORAGE_KEY = "djhub_registered_gigs";
const APPS_STORAGE_KEY = "djhub_applications";
const TRACKING_KEY = "djhub_tracking";
const NOTIF_KEY = "djhub_notifications";
const FAV_GIGS_KEY = "djhub_fav_gigs";
const FAV_DJS_KEY = "djhub_fav_djs";
const CURRENT_DJ_PROFILE_KEY = "djhub_dj_profile";
const CURRENT_VENUE_PROFILE_KEY = "djhub_venue_profile";

// --- Types ---

export interface Application {
  id: string;
  djName: string;
  djId: string;
  gigId: string;
  venueName: string;
  date: string;
  status: "new" | "reviewed" | "accepted" | "rejected";
}

export interface TrackingData {
  applicationsCount: number;
  contactsClicked: number;
  profileViews: number;
  gigOpens: number;
}

export interface Notification {
  id: string;
  type: "application" | "status_change";
  message: string;
  relatedId: string;
  date: string;
  read: boolean;
}

// --- localStorage helpers ---

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

// --- Registered entities ---

function getRegisteredDjs(): DJ[] { return readJson<DJ[]>(DJ_STORAGE_KEY, []); }
function getRegisteredVenues(): Venue[] { return readJson<Venue[]>(VENUE_STORAGE_KEY, []); }

export function registerDj(dj: DJ): void {
  const current = getRegisteredDjs();
  current.push(dj);
  writeJson(DJ_STORAGE_KEY, current);
}

export function registerVenue(venue: Venue): void {
  const current = getRegisteredVenues();
  current.push(venue);
  writeJson(VENUE_STORAGE_KEY, current);
}

// --- Registered gigs ---

function getRegisteredGigs(): Gig[] { return readJson<Gig[]>(GIGS_STORAGE_KEY, []); }

export function addGig(gig: Gig): void {
  const current = getRegisteredGigs();
  current.push(gig);
  writeJson(GIGS_STORAGE_KEY, current);
}

export function deleteGigLocal(id: string): void {
  writeJson(GIGS_STORAGE_KEY, getRegisteredGigs().filter((g) => g.id !== id));
}

export function updateGig(id: string, updates: Partial<Gig>): void {
  const gigs = getRegisteredGigs().map((g) => g.id === id ? { ...g, ...updates } : g);
  writeJson(GIGS_STORAGE_KEY, gigs);
}

// --- Merged getters ---

export function getAllDjs(): DJ[] { return getRegisteredDjs(); }
export function getAllVenues(): Venue[] { return getRegisteredVenues(); }
export function getAllGigs(): Gig[] { return getRegisteredGigs(); }

export function getDjById(id: string): DJ | undefined { return getAllDjs().find((d) => d.id === id); }
export function getVenueById(id: string): Venue | undefined { return getAllVenues().find((v) => v.id === id); }
export function getGigById(id: string): Gig | undefined { return getAllGigs().find((g) => g.id === id); }

// --- Admin delete ---

export function deleteDjLocal(id: string): void {
  writeJson(DJ_STORAGE_KEY, getRegisteredDjs().filter((d) => d.id !== id));
}

export function deleteVenueLocal(id: string): void {
  writeJson(VENUE_STORAGE_KEY, getRegisteredVenues().filter((v) => v.id !== id));
}

// --- Current user profile ---

export function getCurrentDjProfile(): DjProfileModel | null { return readJson<DjProfileModel | null>(CURRENT_DJ_PROFILE_KEY, null); }
export function getCurrentVenueProfile(): VenueProfileModel | null { return readJson<VenueProfileModel | null>(CURRENT_VENUE_PROFILE_KEY, null); }

// --- Applications ---

export function getApplications(): Application[] { return readJson<Application[]>(APPS_STORAGE_KEY, []); }

export function addApplication(app: Application): void {
  const apps = getApplications();
  apps.push(app);
  writeJson(APPS_STORAGE_KEY, apps);
}

export function hasApplied(djId: string, gigId: string): boolean {
  return getApplications().some((a) => a.djId === djId && a.gigId === gigId);
}

export function getApplicationsForGig(gigId: string): Application[] {
  return getApplications().filter((a) => a.gigId === gigId);
}

export function getApplicationsForDj(djId: string): Application[] {
  return getApplications().filter((a) => a.djId === djId);
}

export function updateApplicationStatus(id: string, status: Application["status"]): void {
  const apps = getApplications();
  const app = apps.find((a) => a.id === id);
  const updated = apps.map((a) => a.id === id ? { ...a, status } : a);
  writeJson(APPS_STORAGE_KEY, updated);

  // Notify DJ about status change
  if (app) {
    const msg = status === "accepted"
      ? `Ваш отклик на ${app.venueName} принят!`
      : status === "rejected"
        ? `Ваш отклик на ${app.venueName} отклонён`
        : `Ваш отклик на ${app.venueName} просмотрен`;
    addNotification({ type: "status_change", message: msg, relatedId: app.gigId });
  }
}

export function deleteApplication(id: string): void {
  writeJson(APPS_STORAGE_KEY, getApplications().filter((a) => a.id !== id));
}

// --- Tracking ---

export function getTracking(): TrackingData {
  return readJson<TrackingData>(TRACKING_KEY, { applicationsCount: 0, contactsClicked: 0, profileViews: 0, gigOpens: 0 });
}

export function trackEvent(event: keyof TrackingData): void {
  const data = getTracking();
  data[event]++;
  writeJson(TRACKING_KEY, data);
}

// --- Notifications ---

export function getNotifications(): Notification[] {
  return readJson<Notification[]>(NOTIF_KEY, []);
}

export function addNotification(opts: { type: Notification["type"]; message: string; relatedId: string }): void {
  const notifs = getNotifications();
  notifs.unshift({
    id: "notif-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    ...opts,
    date: new Date().toLocaleString("ru-RU"),
    read: false,
  });
  writeJson(NOTIF_KEY, notifs);
}

export function markNotificationRead(id: string): void {
  const notifs = getNotifications().map((n) => n.id === id ? { ...n, read: true } : n);
  writeJson(NOTIF_KEY, notifs);
}

export function markAllNotificationsRead(): void {
  const notifs = getNotifications().map((n) => ({ ...n, read: true }));
  writeJson(NOTIF_KEY, notifs);
}

export function getUnreadCount(): number {
  return getNotifications().filter((n) => !n.read).length;
}

// --- Favorites ---

export function getFavoriteGigs(): string[] { return readJson<string[]>(FAV_GIGS_KEY, []); }
export function getFavoriteDjs(): string[] { return readJson<string[]>(FAV_DJS_KEY, []); }

export function toggleFavoriteGig(gigId: string): boolean {
  const favs = getFavoriteGigs();
  const idx = favs.indexOf(gigId);
  if (idx >= 0) { favs.splice(idx, 1); writeJson(FAV_GIGS_KEY, favs); return false; }
  favs.push(gigId); writeJson(FAV_GIGS_KEY, favs); return true;
}

export function toggleFavoriteDj(djId: string): boolean {
  const favs = getFavoriteDjs();
  const idx = favs.indexOf(djId);
  if (idx >= 0) { favs.splice(idx, 1); writeJson(FAV_DJS_KEY, favs); return false; }
  favs.push(djId); writeJson(FAV_DJS_KEY, favs); return true;
}

export function isFavoriteGig(gigId: string): boolean { return getFavoriteGigs().includes(gigId); }
export function isFavoriteDj(djId: string): boolean { return getFavoriteDjs().includes(djId); }

// --- Profile update ---



export async function updateDjProfile(updates: Partial<DjProfileModel>): Promise<DjProfileModel | null> {
  const profile = getCurrentDjProfile();
  if (!profile) return null;

  const { error } = await supabase
    .from("dj_profiles")
    .update(mapDjToDb(updates))
    .eq("id", profile.id);

  if (error) {
    console.error("Supabase update error:", error);
    throw error;
  }

  const updated = mapDjToLocalStorage({
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
    openToCollab: updates.openToCollab ?? profile.openToCollab ?? false,
    openToCrew: updates.openToCrew ?? profile.openToCrew ?? false,
  } as DjProfileModel);
  localStorage.setItem(CURRENT_DJ_PROFILE_KEY, JSON.stringify(updated));
  return updated;
}

export async function updateVenueProfile(updates: Partial<VenueProfileModel>): Promise<VenueProfileModel | null> {
  const profile = getCurrentVenueProfile();
  if (!profile) return null;

  const { error } = await supabase
    .from("venue_profiles")
    .update(mapVenueToDb(updates))
    .eq("id", profile.id);

  if (error) {
    console.error("Supabase venue update error:", error);
    throw error;
  }

  const updated = mapVenueToLocalStorage(mergeVenueProfile(profile, updates));
  localStorage.setItem(CURRENT_VENUE_PROFILE_KEY, JSON.stringify(updated));
  return updated;
}
// --- Venue gig management ---

export function getGigsForVenue(venueId: string): Gig[] {
  return getAllGigs().filter((g) => g.venueId === venueId);
}

export function toggleGigStatus(gigId: string): void {
  // Check registered gigs first
  const registered = getRegisteredGigs();
  const idx = registered.findIndex((g) => g.id === gigId);
  if (idx >= 0) {
    registered[idx].status = registered[idx].status === "open" ? "closed" : "open";
    writeJson(GIGS_STORAGE_KEY, registered);
  }
}
