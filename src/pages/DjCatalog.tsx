import { useState, useMemo, useEffect, useCallback, useDeferredValue } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MUSIC_STYLES } from "@/data/djhub-data";
import DjCard from "@/components/DjCard";
import CatalogGrid from "@/components/CatalogGrid";
import CatalogSortBar, { type CatalogSortKey } from "@/components/CatalogSortBar";
import { Filter, SlidersHorizontal, Search, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { cachedRequest, getCacheSnapshot, setCachedValue } from "@/lib/requestCache";
import { calculateDjScore, getMatchReasons } from "@/utils/matching";
import { getCleanDisplayOptions } from "@/lib/displayLabels";
import { getCityLabel } from "@/lib/geography";
import { getDjExperienceLabel } from "@/lib/djOptions";
import { matchesSearch } from "@/lib/searchNormalization";

type DJProfile = {
  id: string;
  user_id: string;
  name: string;
  city: string;
  styles: string[];
  priority_style?: string | null;
  price?: string | null;
  experience?: string | null;
  played_at?: string[] | null;
  image_url?: string | null;
  created_at?: string | null;
  is_verified?: boolean | null;
  is_trusted?: boolean | null;
  availability?: string | null;
  bio?: string | null;
  contact?: string | null;
  format?: string | null;
  status: "active" | "hidden" | "archived" | "blocked";
};

const DJ_PROXY_URL = "http://localhost:3001/api/djs";

async function fetchDjsFromSupabase(): Promise<DJProfile[]> {
  const { data, error } = await supabase
    .from("dj_profiles")
    .select("id,user_id,name,city,styles,priority_style,price,experience,played_at,image_url,status,created_at,is_verified,is_trusted")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load DJ catalog", error);
    return [];
  }

  return (data ?? []) as DJProfile[];
}

async function fetchDjsProxyFirst(): Promise<DJProfile[]> {
  try {
    const response = await fetch(DJ_PROXY_URL);
    if (!response.ok) {
      throw new Error(`Proxy responded with ${response.status}`);
    }

    const payload = await response.json() as { ok?: boolean; data?: DJProfile[] };
    if (!payload?.ok || !Array.isArray(payload.data)) {
      throw new Error("Proxy returned unexpected DJ payload");
    }

    return payload.data;
  } catch (error) {
    console.warn("DJ catalog proxy failed, falling back to Supabase", error);
    return fetchDjsFromSupabase();
  }
}

const DjCatalog = () => {
  const cacheKey = "catalog:djs:active";
  const cacheSnapshot = getCacheSnapshot<DJProfile[]>(cacheKey);
  const CATALOG_CACHE_TTL = 90_000;
  const [allDjs, setAllDjs] = useState<DJProfile[]>(() => cacheSnapshot.value ?? []);
  const [loading, setLoading] = useState(() => !cacheSnapshot.value);
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [filterStyle, setFilterStyle] = useState("");
  const [filterExperience, setFilterExperience] = useState("");
  const [sortBy, setSortBy] = useState<CatalogSortKey>("match");
  const { isAdmin, venueProfile } = useAuth();
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    let active = true;
    const snapshot = getCacheSnapshot<DJProfile[]>(cacheKey);
    if (snapshot.value) {
      setAllDjs(snapshot.value);
      setLoading(false);
    } else {
      setAllDjs([]);
      setLoading(true);
    }

    if (snapshot.exists && !snapshot.isStale) {
      return () => {
        active = false;
      };
    }

    cachedRequest(cacheKey, async () => {
      return fetchDjsProxyFirst();
    }, CATALOG_CACHE_TTL)
      .then((data) => {
      if (!active) return;
      const safeData = (data ?? []) as DJProfile[];
      setAllDjs(safeData);
      safeData.forEach((dj) => setCachedValue(`dj:${dj.id}`, dj, CATALOG_CACHE_TTL));
      setLoading(false);
      })
      .catch((error) => {
        if (!active) return;
        console.error("Failed to hydrate DJ catalog", error);
        setAllDjs([]);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleDeleteDj = useCallback(async (id: string) => {
    if (!confirm("Скрыть DJ из маркетплейса?")) return;
    const { error, count } = await supabase.from("dj_profiles").update({ status: "hidden" }, { count: "exact" }).eq("id", id);
    if (error) {
      toast.error("Не удалось скрыть DJ");
      return;
    }
    if (count === 0) {
      toast.error("Не удалось скрыть — нет прав администратора");
      return;
    }
    setAllDjs((prev) => {
      const next = prev.filter((dj) => dj.id !== id);
      setCachedValue(cacheKey, next);
      return next;
    });
    toast.success("DJ скрыт из маркетплейса");
  }, []);

  const cities = useMemo(() => getCleanDisplayOptions(allDjs.map((d) => d.city), getCityLabel), [allDjs]);
  const experiences = useMemo(() => getCleanDisplayOptions(allDjs.map((d) => d.experience), getDjExperienceLabel), [allDjs]);

  const hasActiveFilters = !!(filterCity || filterStyle || filterExperience || search);

  const resetFilters = useCallback(() => {
    setSearch("");
    setFilterCity("");
    setFilterStyle("");
    setFilterExperience("");
  }, []);

  const filtered = useMemo(() => {
    let list = [...allDjs];
    if (deferredSearch) {
      list = list.filter((d) =>
        matchesSearch(deferredSearch, [
          d.name,
          d.city,
          getCityLabel(d.city),
          ...(d.styles ?? []),
        ])
      );
    }
    if (filterCity) list = list.filter((d) => d.city === filterCity);
    if (filterStyle) list = list.filter((d) => d.styles.includes(filterStyle));
    if (filterExperience) list = list.filter((d) => d.experience === filterExperience);
    if (sortBy === "match" && venueProfile) {
      list = list
        .map((dj) => ({ dj, score: calculateDjScore(dj, venueProfile) }))
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return new Date(b.dj.created_at).getTime() - new Date(a.dj.created_at).getTime();
        })
        .map(({ dj }) => dj);
    } else if (sortBy === "price") {
      list.sort((a, b) => {
        const numA = parseInt(a.price.replace(/\D/g, "")) || 0;
        const numB = parseInt(b.price.replace(/\D/g, "")) || 0;
        return numA - numB;
      });
    } else if (sortBy === "popular") {
      list.sort((a, b) => {
        const ratingA = Number((a as any).rating ?? (a as any).average_rating ?? 0);
        const ratingB = Number((b as any).rating ?? (b as any).average_rating ?? 0);
        if (ratingB !== ratingA) return ratingB - ratingA;
        const playedA = Array.isArray(a.played_at) ? a.played_at.length : 0;
        const playedB = Array.isArray(b.played_at) ? b.played_at.length : 0;
        if (playedB !== playedA) return playedB - playedA;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    } else if (sortBy === "newest") {
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return list;
  }, [allDjs, deferredSearch, filterCity, filterStyle, filterExperience, sortBy, venueProfile]);

  const selectCls = "djhub-select";

  return (
    <div className="min-h-screen pt-20 pb-12">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-2xl font-bold">
            <span className="text-primary neon-text">DJ</span> каталог
          </h1>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
              showFilters ? "border-primary/40 bg-primary/10 text-primary" : "border-white/10 bg-white/5 text-muted-foreground hover:border-primary/30 hover:text-foreground"
            }`}
          >
            <Filter className="h-3 w-3" /> Фильтры
          </button>
        </div>

        <div className="relative mb-3">
  <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 shrink-0 text-muted-foreground" />

  <input
    type="text"
    placeholder="Поиск по имени, городу или стилю..."
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    className="premium-input !pl-16 !pr-10 py-2"
  />

  {search && (
    <button
      onClick={() => setSearch("")}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  )}
</div>

        <CatalogSortBar value={sortBy} onChange={setSortBy} />

        {showFilters && (
          <div className="premium-surface mb-5 flex flex-wrap items-center gap-2 px-4 py-3">
            <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
            <select className={selectCls} value={filterCity} onChange={(e) => setFilterCity(e.target.value)}>
              <option value="">Все города</option>
              {cities.map((c) => <option key={c} value={c}>{getCityLabel(c)}</option>)}
            </select>
            <select className={selectCls} value={filterStyle} onChange={(e) => setFilterStyle(e.target.value)}>
              <option value="">Все стили</option>
              {MUSIC_STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className={selectCls} value={filterExperience} onChange={(e) => setFilterExperience(e.target.value)}>
              <option value="">Любой опыт</option>
              {experiences.map((e) => <option key={e} value={e}>{getDjExperienceLabel(e)}</option>)}
            </select>
            {hasActiveFilters && (
              <button onClick={resetFilters} className="text-[10px] text-primary hover:underline ml-1">
                Сбросить
              </button>
            )}
          </div>
        )}

        {loading ? (
          <CatalogGrid
            items={[] as DJProfile[]}
            loading
            getKey={(dj) => dj.id}
            renderItem={() => null}
          />
        ) : filtered.length > 0 ? (
          <CatalogGrid
            items={filtered}
            getKey={(dj) => dj.id}
            renderItem={(dj, i) => (
              <DjCard
                dj={dj}
                index={i}
                isAdmin={isAdmin}
                isBestMatch={!!venueProfile && sortBy === "match" && i < 3}
                matchReasons={venueProfile ? getMatchReasons(dj, venueProfile) : []}
                onDelete={handleDeleteDj}
              />
            )}
          />
        ) : (
          <div className="text-center py-16 space-y-3">
            <p className="text-muted-foreground text-sm">Ничего не найдено</p>
            {hasActiveFilters && (
              <button onClick={resetFilters} className="text-xs text-primary hover:underline">
                Сбросить фильтры
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DjCatalog;
