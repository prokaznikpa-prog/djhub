import type { Tables } from "@/integrations/supabase/types";
import type { DjProfile, VenueProfile } from "@/lib/profile";
import { supabase } from "@/integrations/supabase/client";
import { cachedRequest, setCachedValue } from "@/lib/requestCache";

const WARMUP_TTL = 90_000;
let publicWarmupScheduled = false;

type IdleHandle = number;
type IdleCallback = () => void;

function scheduleIdleTask(callback: IdleCallback): IdleHandle {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    return window.requestIdleCallback(() => callback(), { timeout: 1500 });
  }

  return window.setTimeout(callback, 250);
}

export function schedulePublicWarmup() {
  if (publicWarmupScheduled || typeof window === "undefined") return;
  publicWarmupScheduled = true;

  scheduleIdleTask(() => {
    void cachedRequest(
      "catalog:djs:active",
      async () => {
        const { data, error } = await supabase
          .from("dj_profiles")
          .select("id,user_id,name,city,styles,priority_style,price,experience,played_at,image_url,status,created_at,is_verified,is_trusted")
          .eq("status", "active")
          .order("created_at", { ascending: false });

        if (error) {
          console.error("Warmup failed for DJ catalog", error);
          return [];
        }

        return data ?? [];
      },
      WARMUP_TTL,
    );

    void cachedRequest(
      "catalog:venues:active",
      async () => {
        const { data, error } = await supabase
          .from("venue_profiles")
          .select("id,user_id,name,city,type,music_styles,image_url,status,created_at,is_verified,is_trusted")
          .eq("status", "active")
          .order("created_at", { ascending: false });

        if (error) {
          console.error("Warmup failed for venue catalog", error);
          return [];
        }

        return data ?? [];
      },
      WARMUP_TTL,
    );
  });
}

export function schedulePrivateWarmup(djProfile: DjProfile | null, venueProfile: VenueProfile | null) {
  if (djProfile) {
    setCachedValue(`dj:${djProfile.id}`, djProfile as unknown as Tables<"dj_profiles">, WARMUP_TTL);
  }

  if (venueProfile) {
    setCachedValue(`venue:${venueProfile.id}`, venueProfile as unknown as Tables<"venue_profiles">, WARMUP_TTL);
  }
}
