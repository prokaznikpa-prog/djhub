import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from "react";
import React from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import { mapVenueFromDb, mapVenueToLocalStorage } from "@/lib/venueProfile";
import { mapDjFromDb, mapDjToLocalStorage } from "@/lib/djProfile";
import { schedulePrivateWarmup, schedulePublicWarmup } from "@/lib/appWarmup";
import type { DjProfile, VenueProfile } from "@/lib/profile";

export type { DjProfile, VenueProfile } from "@/lib/profile";

interface AuthState {
user: User | null;
isAdmin: boolean;
loading: boolean;
profilesLoading: boolean;
djProfile: DjProfile | null;
venueProfile: VenueProfile | null;
signOut: () => Promise<void>;
refreshProfiles: () => Promise<void>;
applyProfilePatch: (kind: "dj" | "venue", profile: DjProfile | VenueProfile | null) => void;
}

const AuthContext = createContext<AuthState | null>(null);

const AUTH_TIMEOUT_MS = 3500;
const PROFILE_TIMEOUT_MS = 3000;
const API_URL = import.meta.env.VITE_API_URL;

const withTimeout = async <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
let timeoutId: ReturnType<typeof setTimeout>;

const timeoutPromise = new Promise<never>((_, reject) => {
timeoutId = setTimeout(() => reject(new Error(`${label} timeout`)), ms);
});

try {
return await Promise.race([promise, timeoutPromise]);
} finally {
clearTimeout(timeoutId!);
}
};

const readStoredProfile = <TProfile,>(key: string): TProfile | null => {
try {
const raw = localStorage.getItem(key);
return raw ? (JSON.parse(raw) as TProfile) : null;
} catch {
return null;
}
};

const syncProfileToLocalStorage = (djData: DjProfile | null, venueData: VenueProfile | null) => {
if (djData) localStorage.setItem("djhub_dj_profile", JSON.stringify(djData));
else localStorage.removeItem("djhub_dj_profile");

if (venueData) localStorage.setItem("djhub_venue_profile", JSON.stringify(venueData));
else localStorage.removeItem("djhub_venue_profile");
};

const hasAnyProfile = (djData: DjProfile | null, venueData: VenueProfile | null) => !!djData || !!venueData;

const fetchProfileSummary = async (accessToken: string | null | undefined) => {
if (!accessToken) {
return {
isAdmin: false,
djProfile: null,
venueProfile: null,
};
}

const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), PROFILE_TIMEOUT_MS);

try {
const response = await fetch(`${API_URL}/api/me/profile-summary`, {
headers: {
Authorization: `Bearer ${accessToken}`,
},
signal: controller.signal,
});

if (!response.ok) {
throw new Error(`profile-summary responded with ${response.status}`);
}

const payload = await response.json() as {
ok?: boolean;
data?: {
isAdmin?: boolean;
djProfile?: unknown;
venueProfile?: unknown;
};
isAdmin?: boolean;
djProfile?: unknown;
venueProfile?: unknown;
error?: string;
};

if (payload && "ok" in payload && !payload.ok) {
throw new Error(payload?.error || "profile-summary failed");
}

const summaryData =
  payload && typeof payload === "object" && "data" in payload && payload.data
    ? payload.data
    : payload;

return {
isAdmin: !!summaryData?.isAdmin,
djProfile: summaryData?.djProfile ?? null,
venueProfile: summaryData?.venueProfile ?? null,
};
} finally {
clearTimeout(timeoutId);
}
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
const [user, setUser] = useState<User | null>(null);
const [isAdmin, setIsAdmin] = useState(false);
const [loading, setLoading] = useState(true);
const [profilesLoading, setProfilesLoading] = useState(false);

const [djProfile, setDjProfile] = useState<DjProfile | null>(() =>
readStoredProfile<DjProfile>("djhub_dj_profile")
);

const [venueProfile, setVenueProfile] = useState<VenueProfile | null>(() =>
readStoredProfile<VenueProfile>("djhub_venue_profile")
);

const initializedRef = useRef(false);
const djProfileRef = useRef<DjProfile | null>(djProfile);
const venueProfileRef = useRef<VenueProfile | null>(venueProfile);

useEffect(() => {
djProfileRef.current = djProfile;
}, [djProfile]);

useEffect(() => {
venueProfileRef.current = venueProfile;
}, [venueProfile]);

const applyProfilePatch = (kind: "dj" | "venue", profile: DjProfile | VenueProfile | null) => {
if (kind === "dj") {
const nextDj = profile as DjProfile | null;
setDjProfile(nextDj);
djProfileRef.current = nextDj;
syncProfileToLocalStorage(nextDj, venueProfileRef.current);
schedulePrivateWarmup(nextDj, venueProfileRef.current);
return;
}

const nextVenue = profile as VenueProfile | null;
setVenueProfile(nextVenue);
venueProfileRef.current = nextVenue;
syncProfileToLocalStorage(djProfileRef.current, nextVenue);
schedulePrivateWarmup(djProfileRef.current, nextVenue);
};

const loadUserData = async (currentUser: User | null, accessToken?: string | null) => {
if (!currentUser) {
setUser(null);
setIsAdmin(false);
setProfilesLoading(false);
setDjProfile(null);
setVenueProfile(null);
djProfileRef.current = null;
venueProfileRef.current = null;
syncProfileToLocalStorage(null, null);
return;
}

setUser(currentUser);
setProfilesLoading(true);

try {
const summary = await withTimeout(
fetchProfileSummary(accessToken),
PROFILE_TIMEOUT_MS,
"loadUserData"
);

setIsAdmin(!!summary.isAdmin);

const dj = mapDjFromDb(summary.djProfile);
const djForUi = mapDjToLocalStorage(dj) as DjProfile | null;

const venue = mapVenueFromDb(summary.venueProfile);
const venueForUi = mapVenueToLocalStorage(venue) as VenueProfile | null;

const currentDj = djProfileRef.current;
const currentVenue = venueProfileRef.current;
const shouldKeepExistingProfiles =
  !hasAnyProfile(djForUi, venueForUi) && hasAnyProfile(currentDj, currentVenue);

if (shouldKeepExistingProfiles) {
  syncProfileToLocalStorage(currentDj, currentVenue);
  schedulePrivateWarmup(currentDj, currentVenue);
  return;
}

setDjProfile(djForUi);
setVenueProfile(venueForUi);
djProfileRef.current = djForUi;
venueProfileRef.current = venueForUi;

syncProfileToLocalStorage(djForUi, venueForUi);
schedulePrivateWarmup(djForUi, venueForUi);
} catch (error) {
console.warn("Auth profiles unavailable, keeping current/local profile state", error);

const storedDj = readStoredProfile<DjProfile>("djhub_dj_profile");
const storedVenue = readStoredProfile<VenueProfile>("djhub_venue_profile");
const nextDj = djProfileRef.current ?? storedDj;
const nextVenue = venueProfileRef.current ?? storedVenue;
setDjProfile(nextDj);
setVenueProfile(nextVenue);
djProfileRef.current = nextDj;
venueProfileRef.current = nextVenue;
syncProfileToLocalStorage(nextDj, nextVenue);
schedulePrivateWarmup(nextDj, nextVenue);
} finally {
setProfilesLoading(false);
}
};

useEffect(() => {
let mounted = true;

const initAuth = async () => {
try {
const {
data: { session },
} = await withTimeout(supabase.auth.getSession(), AUTH_TIMEOUT_MS, "getSession");

if (!mounted) return;

const currentUser = session?.user ?? null;
const accessToken = session?.access_token ?? null;

initializedRef.current = true;
schedulePublicWarmup();

// ВАЖНО: ждём профиль ДО отключения loading
await loadUserData(currentUser, accessToken);
} catch (error) {
if (!mounted) return;

console.warn("Supabase auth unavailable, app continues as guest", error);

setUser(null);
setIsAdmin(false);
setProfilesLoading(false);
initializedRef.current = true;
schedulePublicWarmup();
} finally {
if (mounted) {
setLoading(false);
}
}
};

void initAuth();

const {
data: { subscription },
} = supabase.auth.onAuthStateChange((_event, session) => {
if (!initializedRef.current) return;
void loadUserData(session?.user ?? null, session?.access_token ?? null);
});

return () => {
mounted = false;
subscription.unsubscribe();
};
}, []);

const signOut = async () => {
try {
await withTimeout(supabase.auth.signOut(), AUTH_TIMEOUT_MS, "signOut");
} catch (error) {
console.warn("Supabase signOut unavailable, clearing local auth state", error);
}

setUser(null);
setIsAdmin(false);
setProfilesLoading(false);
setDjProfile(null);
setVenueProfile(null);
djProfileRef.current = null;
venueProfileRef.current = null;
syncProfileToLocalStorage(null, null);
};

const refreshProfiles = async () => {
if (!user) return;

setProfilesLoading(true);

try {
const {
data: { session },
} = await withTimeout(supabase.auth.getSession(), AUTH_TIMEOUT_MS, "getSession");

const summary = await withTimeout(
fetchProfileSummary(session?.access_token ?? null),
PROFILE_TIMEOUT_MS,
"refreshProfiles"
);

setIsAdmin(!!summary.isAdmin);

const dj = mapDjFromDb(summary.djProfile);
const djForUi = mapDjToLocalStorage(dj) as DjProfile | null;

const venue = mapVenueFromDb(summary.venueProfile);
const venueForUi = mapVenueToLocalStorage(venue) as VenueProfile | null;

const shouldKeepExistingProfiles =
  !hasAnyProfile(djForUi, venueForUi) && hasAnyProfile(djProfileRef.current, venueProfileRef.current);

if (shouldKeepExistingProfiles) {
  syncProfileToLocalStorage(djProfileRef.current, venueProfileRef.current);
  schedulePrivateWarmup(djProfileRef.current, venueProfileRef.current);
  return;
}

setDjProfile(djForUi);
setVenueProfile(venueForUi);
djProfileRef.current = djForUi;
venueProfileRef.current = venueForUi;

syncProfileToLocalStorage(djForUi, venueForUi);
schedulePrivateWarmup(djForUi, venueForUi);
} catch (error) {
console.warn("Failed to refresh profiles, keeping current/local profile state", error);
} finally {
setProfilesLoading(false);
}
};

return React.createElement(
AuthContext.Provider,
{
value: {
user,
isAdmin,
loading,
profilesLoading,
signOut,
djProfile,
venueProfile,
refreshProfiles,
applyProfilePatch,
},
},
children
);
};

export const useAuth = (): AuthState => {
const ctx = useContext(AuthContext);
if (!ctx) throw new Error("useAuth must be used within AuthProvider");
return ctx;
};
