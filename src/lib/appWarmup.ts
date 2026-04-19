import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { DjProfile, VenueProfile } from "@/lib/profile";
import { cachedRequest, getCachedValue, setCachedValue } from "@/lib/requestCache";
import { preloadCriticalRoutes } from "@/lib/routePreload";
import { fetchChatThreadsForParticipant, getChatThreadsCacheKey } from "@/hooks/useChat";

const WARMUP_TTL = 90_000;
const warmed = new Set<string>();

const scheduleIdle = (task: () => void) => {
  if (typeof window === "undefined") return;
  const idle = window.requestIdleCallback
    ?? ((callback: IdleRequestCallback) => window.setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 0 }), 350));
  idle(task, { timeout: 1200 });
};

const warmOnce = (key: string, task: () => Promise<unknown>) => {
  if (warmed.has(key) || getCachedValue<unknown>(key) !== null) return;
  warmed.add(key);
  void task().catch(() => {
    warmed.delete(key);
  });
};

export function schedulePublicWarmup() {
  scheduleIdle(() => {
    preloadCriticalRoutes();

    warmOnce("catalog:djs:active", async () => {
      const data = await cachedRequest("catalog:djs:active", async () => {
        const { data } = await supabase
          .from("dj_profiles")
          .select("*")
          .eq("status", "active")
          .order("created_at", { ascending: false });
        return data ?? [];
      }, WARMUP_TTL);
      (data as Tables<"dj_profiles">[]).slice(0, 12).forEach((dj) => setCachedValue(`dj:${dj.id}`, dj, WARMUP_TTL));
      return data;
    });

    warmOnce("catalog:venues:active", async () => {
      const data = await cachedRequest("catalog:venues:active", async () => {
        const { data } = await supabase
          .from("venue_profiles")
          .select("*")
          .eq("status", "active")
          .order("created_at", { ascending: false });
        return data ?? [];
      }, WARMUP_TTL);
      (data as Tables<"venue_profiles">[]).slice(0, 12).forEach((venue) => setCachedValue(`venue:${venue.id}`, venue, WARMUP_TTL));
      return data;
    });

    const openPostsKey = `venue-posts:${JSON.stringify({ status: "open" })}`;
    warmOnce(openPostsKey, async () => {
      const data = await cachedRequest(openPostsKey, async () => {
        const { data } = await supabase
          .from("venue_posts")
          .select("*")
          .eq("status", "open")
          .order("created_at", { ascending: false });
        return data ?? [];
      }, WARMUP_TTL);
      (data as Tables<"venue_posts">[]).slice(0, 12).forEach((post) => setCachedValue(`post:${post.id}`, post, WARMUP_TTL));
      return data;
    });
  });
}

export function schedulePrivateWarmup(djProfile: DjProfile | null, venueProfile: VenueProfile | null) {
  schedulePublicWarmup();

  if (djProfile) {
    setCachedValue(`dj:${djProfile.id}`, djProfile as unknown as Tables<"dj_profiles">, WARMUP_TTL);
    scheduleIdle(() => {
      const appsKey = `applications-dj:${djProfile.id}`;
      warmOnce(appsKey, () => cachedRequest(appsKey, async () => {
        const { data } = await supabase
          .from("applications")
          .select("*, venue_posts(*, venue_profiles(*))")
          .eq("dj_id", djProfile.id)
          .order("created_at", { ascending: false });
        return data ?? [];
      }, WARMUP_TTL));

      const invitesKey = `invitations-dj:${djProfile.id}`;
      warmOnce(invitesKey, () => cachedRequest(invitesKey, async () => {
        const { data } = await supabase
          .from("invitations")
          .select("*, venue_posts(*), venue_profiles(*)")
          .eq("dj_id", djProfile.id)
          .order("created_at", { ascending: false });
        return data ?? [];
      }, WARMUP_TTL));

      const participant = { profileId: djProfile.id, kind: "dj" as const };
      const chatKey = getChatThreadsCacheKey(participant);
      warmOnce(chatKey, () => cachedRequest(chatKey, () => fetchChatThreadsForParticipant(participant), 45_000));
    });
  }

  if (venueProfile) {
    setCachedValue(`venue:${venueProfile.id}`, venueProfile as unknown as Tables<"venue_profiles">, WARMUP_TTL);
    scheduleIdle(() => {
      const postsKey = `venue-posts-by-venue:${venueProfile.id}`;
      warmOnce(postsKey, async () => {
        const data = await cachedRequest(postsKey, async () => {
          const { data } = await supabase
            .from("venue_posts")
            .select("*")
            .eq("venue_id", venueProfile.id)
            .order("created_at", { ascending: false });
          return data ?? [];
        }, WARMUP_TTL);
        (data as Tables<"venue_posts">[]).slice(0, 12).forEach((post) => setCachedValue(`post:${post.id}`, post, WARMUP_TTL));
        return data;
      });

      const appsKey = `applications-venue:${venueProfile.id}`;
      warmOnce(appsKey, () => cachedRequest(appsKey, async () => {
        const { data } = await supabase
          .from("applications")
          .select("*, dj_profiles(*), venue_posts!inner(*)")
          .eq("venue_posts.venue_id", venueProfile.id)
          .order("created_at", { ascending: false });
        return data ?? [];
      }, WARMUP_TTL));

      const invitesKey = `invitations-venue:${venueProfile.id}`;
      warmOnce(invitesKey, () => cachedRequest(invitesKey, async () => {
        const { data } = await supabase
          .from("invitations")
          .select("*, dj_profiles(*), venue_posts(*)")
          .eq("venue_id", venueProfile.id)
          .order("created_at", { ascending: false });
        return data ?? [];
      }, WARMUP_TTL));

      const participant = { profileId: venueProfile.id, kind: "venue" as const };
      const chatKey = getChatThreadsCacheKey(participant);
      warmOnce(chatKey, () => cachedRequest(chatKey, () => fetchChatThreadsForParticipant(participant), 45_000));
    });
  }
}
