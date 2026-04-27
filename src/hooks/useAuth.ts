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
const PROFILE_TIMEOUT_MS = 5000;

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

const applyProfilePatch = (kind: "dj" | "venue", profile: DjProfile | VenueProfile | null) => {
if (kind === "dj") {
const nextDj = profile as DjProfile | null;
setDjProfile(nextDj);
syncProfileToLocalStorage(nextDj, venueProfile);
schedulePrivateWarmup(nextDj, venueProfile);
return;
}

const nextVenue = profile as VenueProfile | null;
setVenueProfile(nextVenue);
syncProfileToLocalStorage(djProfile, nextVenue);
schedulePrivateWarmup(djProfile, nextVenue);
};

const loadUserData = async (currentUser: User | null) => {
if (!currentUser) {
setUser(null);
setIsAdmin(false);
setProfilesLoading(false);
setDjProfile(null);
setVenueProfile(null);
syncProfileToLocalStorage(null, null);
return;
}

setUser(currentUser);
setProfilesLoading(true);

try {
const [adminRes, djRes, venueRes] = await withTimeout(
Promise.all([
supabase
.from("user_roles")
.select("role")
.eq("user_id", currentUser.id)
.eq("role", "admin")
.maybeSingle(),

supabase
.from("dj_profiles")
.select("*")
.eq("user_id", currentUser.id)
.maybeSingle(),

supabase
.from("venue_profiles")
.select("*")
.eq("user_id", currentUser.id)
.maybeSingle(),
]),
PROFILE_TIMEOUT_MS,
"loadUserData"
);

setIsAdmin(!!adminRes.data);

const dj = mapDjFromDb(djRes.data);
const djForUi = mapDjToLocalStorage(dj) as DjProfile | null;

const venue = mapVenueFromDb(venueRes.data);
const venueForUi = mapVenueToLocalStorage(venue) as VenueProfile | null;

setDjProfile(djForUi);
setVenueProfile(venueForUi);

syncProfileToLocalStorage(djForUi, venueForUi);
schedulePrivateWarmup(djForUi, venueForUi);
} catch (error) {
console.warn("Auth profiles unavailable, keeping current/local profile state", error);

const storedDj = readStoredProfile<DjProfile>("djhub_dj_profile");
const storedVenue = readStoredProfile<VenueProfile>("djhub_venue_profile");

setDjProfile(storedDj);
setVenueProfile(storedVenue);
schedulePrivateWarmup(storedDj, storedVenue);
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

initializedRef.current = true;
schedulePublicWarmup();

// ВАЖНО: ждём профиль ДО отключения loading
await loadUserData(currentUser);
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
void loadUserData(session?.user ?? null);
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
syncProfileToLocalStorage(null, null);
};

const refreshProfiles = async () => {
if (!user) return;

setProfilesLoading(true);

try {
const [djRes, venueRes] = await withTimeout(
Promise.all([
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
PROFILE_TIMEOUT_MS,
"refreshProfiles"
);

const dj = mapDjFromDb(djRes.data);
const djForUi = mapDjToLocalStorage(dj) as DjProfile | null;

const venue = mapVenueFromDb(venueRes.data);
const venueForUi = mapVenueToLocalStorage(venue) as VenueProfile | null;

setDjProfile(djForUi);
setVenueProfile(venueForUi);

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