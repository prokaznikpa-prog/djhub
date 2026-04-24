import { useCallback, useMemo, useState, useEffect, useDeferredValue } from "react";
import { supabase } from "@/integrations/supabase/client";
import VenueCard from "@/components/VenueCard";
import CatalogGrid from "@/components/CatalogGrid";
import CatalogSortBar, { type CatalogSortKey } from "@/components/CatalogSortBar";
import { Search, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import type { Tables } from "@/integrations/supabase/types";
import { cachedRequest, getCacheSnapshot, setCachedValue } from "@/lib/requestCache";
import { getCityLabel } from "@/lib/geography";
import { matchesSearch } from "@/lib/searchNormalization";

const VENUES_PROXY_URL = "http://localhost:3001/api/venues";

async function fetchVenuesFromSupabase(): Promise<Tables<"venue_profiles">[]> {
  const { data, error } = await supabase
    .from("venue_profiles")
    .select("id,user_id,name,city,type,music_styles,image_url,status,created_at,is_verified,is_trusted")
    .eq("status", "active")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Failed to load venue catalog", error);
    return [];
  }
  return (data ?? []) as Tables<"venue_profiles">[];
}

async function fetchVenuesProxyFirst(): Promise<Tables<"venue_profiles">[]> {
  try {
    const response = await fetch(VENUES_PROXY_URL);
    if (!response.ok) {
      throw new Error(`Proxy responded with ${response.status}`);
    }

    const payload = await response.json() as { ok?: boolean; data?: Tables<"venue_profiles">[] };
    if (!payload?.ok || !Array.isArray(payload.data)) {
      throw new Error("Proxy returned unexpected venue payload");
    }

    return payload.data;
  } catch (error) {
    console.warn("Venue catalog proxy failed, falling back to Supabase", error);
    return fetchVenuesFromSupabase();
  }
}

function warmVenueEntityCache(items: Tables<"venue_profiles">[], ttl: number) {
  const run = () => {
    items.forEach((venue) => {
      setCachedValue(`venue:${venue.id}`, venue, ttl);
    });
  };

  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    window.requestIdleCallback(run);
    return;
  }

  setTimeout(run, 0);
}

const VenueCatalog = () => {
  const cacheKey = "catalog:venues:active";
  const cacheSnapshot = getCacheSnapshot<Tables<"venue_profiles">[]>(cacheKey);
  const CATALOG_CACHE_TTL = 90_000;
  const [venues, setVenues] = useState<Tables<"venue_profiles">[]>(() => cacheSnapshot.value ?? []);
  const [loading, setLoading] = useState(() => !cacheSnapshot.value);
  const [sortBy, setSortBy] = useState<CatalogSortKey>("match");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const { isAdmin } = useAuth();

  useEffect(() => {
    let active = true;
    const snapshot = getCacheSnapshot<Tables<"venue_profiles">[]>(cacheKey);
    if (snapshot.value) {
      setVenues(snapshot.value);
      setLoading(false);
    } else {
      setVenues([]);
      setLoading(true);
    }

    if (snapshot.exists && !snapshot.isStale) {
      return () => {
        active = false;
      };
    }

    console.time("venue catalog load");
    cachedRequest(cacheKey, async () => {
      return fetchVenuesProxyFirst();
    }, CATALOG_CACHE_TTL).then((data) => {
      if (!active) return;
      setVenues(data);
      warmVenueEntityCache(data, CATALOG_CACHE_TTL);
      setLoading(false);
      console.timeEnd("venue catalog load");
    }).catch((error) => {
      if (!active) return;
      console.error("Failed to hydrate venue catalog", error);
      setLoading(false);
      console.timeEnd("venue catalog load");
    });

    return () => {
      active = false;
    };
  }, []);

  const handleDeleteVenue = useCallback(async (id: string) => {
    if (!confirm("Скрыть заведение из маркетплейса?")) return;
    const { error, count } = await supabase.from("venue_profiles").update({ status: "hidden" }, { count: "exact" }).eq("id", id);
    if (error) {
      toast.error("Не удалось скрыть заведение");
      return;
    }
    if (count === 0) {
      toast.error("Не удалось скрыть — нет прав администратора");
      return;
    }
    setVenues((prev) => {
      const next = prev.filter((venue) => venue.id !== id);
      setCachedValue(cacheKey, next);
      return next;
    });
    toast.success("Заведение скрыто из маркетплейса");
  }, []);

  const sortedVenues = useMemo(() => {
    const filtered = deferredSearch
      ? venues.filter((venue) =>
          matchesSearch(deferredSearch, [
            venue.name,
            venue.city,
            getCityLabel(venue.city),
            ...(venue.music_styles ?? []),
          ])
        )
      : venues;

    const list = filtered.map((venue, index) => ({ venue, index }));
    if (sortBy === "newest") {
      list.sort((a, b) => new Date(b.venue.created_at).getTime() - new Date(a.venue.created_at).getTime());
    } else if (sortBy === "popular") {
      list.sort((a, b) => {
        const ratingA = Number((a.venue as any).rating ?? (a.venue as any).average_rating ?? 0);
        const ratingB = Number((b.venue as any).rating ?? (b.venue as any).average_rating ?? 0);
        if (ratingB !== ratingA) return ratingB - ratingA;
        return a.index - b.index;
      });
    } else if (sortBy === "price") {
      list.sort((a, b) => {
        const priceA = parseInt(String((a.venue as any).price ?? (a.venue as any).budget ?? ""), 10);
        const priceB = parseInt(String((b.venue as any).price ?? (b.venue as any).budget ?? ""), 10);
        const safeA = Number.isFinite(priceA) ? priceA : Number.POSITIVE_INFINITY;
        const safeB = Number.isFinite(priceB) ? priceB : Number.POSITIVE_INFINITY;
        if (safeA !== safeB) return safeA - safeB;
        return a.index - b.index;
      });
    }
    return list.map(({ venue }) => venue);
  }, [venues, deferredSearch, sortBy]);

  return (
    <div className="min-h-screen pt-20 pb-12">
      <div className="container mx-auto px-4">
        <h1 className="mb-3 text-2xl font-bold">
          <span className="text-primary neon-text">Заведения</span>
        </h1>

        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 shrink-0 text-muted-foreground" />
          <input
            type="text"
            placeholder="Поиск по названию, городу или стилю..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="premium-input !pl-16 !pr-10 py-2"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              type="button"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <CatalogSortBar value={sortBy} onChange={setSortBy} hidePrice />
        {loading ? (
          <CatalogGrid
            items={[] as Tables<"venue_profiles">[]}
            loading
            getKey={(venue) => venue.id}
            renderItem={() => null}
          />
        ) : sortedVenues.length === 0 ? (
          <p className="text-muted-foreground text-center py-12 text-sm">Нет заведений</p>
        ) : (
          <CatalogGrid
            items={sortedVenues}
            getKey={(venue) => venue.id}
            renderItem={(venue, i) => (
              <VenueCard venue={venue} index={i} isAdmin={isAdmin} onDelete={handleDeleteVenue} />
            )}
          />
        )}
      </div>
    </div>
  );
};

export default VenueCatalog;
