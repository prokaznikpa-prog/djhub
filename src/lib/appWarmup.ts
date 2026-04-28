import type { Tables } from "@/integrations/supabase/types";
import type { DjProfile, VenueProfile } from "@/lib/profile";
import { cachedRequest, setCachedValue } from "@/lib/requestCache";

const WARMUP_TTL = 90_000;
const WARMUP_TIMEOUT_MS = 6000;
const API_URL = import.meta.env.VITE_API_URL;
let publicWarmupScheduled = false;

type IdleHandle = number;
type IdleCallback = () => void;

function scheduleIdleTask(callback: IdleCallback): IdleHandle {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    return window.requestIdleCallback(() => callback(), { timeout: 1500 });
  }

  return window.setTimeout(callback, 250);
}

async function fetchWarmupPayload<T>(path: string): Promise<T[]> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), WARMUP_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_URL}${path}`, {
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Warmup backend responded with ${response.status}`);
    }

    const payload = await response.json() as T[] | { ok?: boolean; data?: T[] };

    if (Array.isArray(payload)) {
      return payload;
    }

    if (payload?.ok && Array.isArray(payload.data)) {
      return payload.data;
    }

    return [];
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function schedulePublicWarmup() {
  if (publicWarmupScheduled || typeof window === "undefined") return;
  publicWarmupScheduled = true;

  scheduleIdleTask(() => {
    void cachedRequest(
      "catalog:djs:active",
      async () => {
        try {
          return await fetchWarmupPayload<Tables<"dj_profiles">>("/api/djs");
        } catch {
          return [];
        }
      },
      WARMUP_TTL,
    );

    void cachedRequest(
      "catalog:venues:active",
      async () => {
        try {
          return await fetchWarmupPayload<Tables<"venue_profiles">>("/api/venues");
        } catch {
          return [];
        }
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
