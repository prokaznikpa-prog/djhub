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
}

const AuthContext = createContext<AuthState | null>(null);

const readStoredProfile = <TProfile,>(key: string): TProfile | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as TProfile : null;
  } catch {
    return null;
  }
};

const syncProfileToLocalStorage = (djData: DjProfile | null, venueData: VenueProfile | null) => {
  if (djData) {
    localStorage.setItem("djhub_dj_profile", JSON.stringify(djData));
  } else {
    localStorage.removeItem("djhub_dj_profile");
  }
if (venueData) {
  localStorage.setItem("djhub_venue_profile", JSON.stringify(venueData));
} else {
  localStorage.removeItem("djhub_venue_profile");
}
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [djProfile, setDjProfile] = useState<DjProfile | null>(() => readStoredProfile<DjProfile>("djhub_dj_profile"));
  const [venueProfile, setVenueProfile] = useState<VenueProfile | null>(() => readStoredProfile<VenueProfile>("djhub_venue_profile"));
  const initializedRef = useRef(false);

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
    const [adminRes, djRes, venueRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", currentUser.id).eq("role", "admin").maybeSingle(),
      supabase.from("dj_profiles").select("*").eq("user_id", currentUser.id).maybeSingle(),
      supabase.from("venue_profiles").select("*").eq("user_id", currentUser.id).maybeSingle(),
    ]);

    setIsAdmin(!!adminRes.data);
    const dj = mapDjFromDb(djRes.data);
    const djForUi = mapDjToLocalStorage(dj);

    setDjProfile(djForUi);
    const venue = mapVenueFromDb(venueRes.data);
    const venueForUi = mapVenueToLocalStorage(venue);

    setVenueProfile(venueForUi);
    syncProfileToLocalStorage(
      djForUi,
      venueForUi
    );
    schedulePrivateWarmup(djForUi, venueForUi);
  } finally {
    setProfilesLoading(false);
  }
};
  useEffect(() => {
    // 1. Get initial session first
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      setLoading(false);
      initializedRef.current = true;
      schedulePublicWarmup();
      void loadUserData(currentUser);
    });

    // 2. Listen for subsequent auth changes (sign in/out/token refresh)
    // IMPORTANT: Do NOT await inside this callback to avoid deadlocks
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // Skip if this fires before init completes (it fires synchronously during getSession)
      if (!initializedRef.current) return;
      loadUserData(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
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
    const [djRes, venueRes] = await Promise.all([
      supabase.from("dj_profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("venue_profiles").select("*").eq("user_id", user.id).maybeSingle(),
    ]);

    const dj = mapDjFromDb(djRes.data);
    const djForUi = mapDjToLocalStorage(dj);

    setDjProfile(djForUi);
    const venue = mapVenueFromDb(venueRes.data);
    const venueForUi = mapVenueToLocalStorage(venue);

    setVenueProfile(venueForUi);
    syncProfileToLocalStorage(djForUi, venueForUi);
    schedulePrivateWarmup(djForUi, venueForUi);
  } finally {
    setProfilesLoading(false);
  }

};
  return React.createElement(
    AuthContext.Provider,
    { value: { user, isAdmin, loading, profilesLoading, signOut, djProfile, venueProfile, refreshProfiles } },
    children
  );
};

export const useAuth = (): AuthState => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
  };
