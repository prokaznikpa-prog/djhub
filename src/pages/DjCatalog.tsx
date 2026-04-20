import { useState, useMemo, useEffect, useCallback, useDeferredValue } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MUSIC_STYLES } from "@/data/djhub-data";
import DjCard from "@/components/DjCard";
import CatalogCarousel from "@/components/CatalogCarousel";
import { Filter, SlidersHorizontal, Search, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import type { Tables } from "@/integrations/supabase/types";
import { cachedRequest, getCachedValue, setCachedValue } from "@/lib/requestCache";
import { calculateDjScore, getMatchReasons } from "@/utils/matching";
import { getCleanDisplayOptions } from "@/lib/displayLabels";
import { getCityLabel } from "@/lib/geography";
import { getDjExperienceLabel } from "@/lib/djOptions";

const DjCatalog = () => {
  const cacheKey = "catalog:djs:active";
  const [allDjs, setAllDjs] = useState<Tables<"dj_profiles">[]>(() => getCachedValue<Tables<"dj_profiles">[]>(cacheKey, { allowStale: true }) ?? []);
  const [loading, setLoading] = useState(() => !getCachedValue<Tables<"dj_profiles">[]>(cacheKey, { allowStale: true }));
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [filterStyle, setFilterStyle] = useState("");
  const [filterExperience, setFilterExperience] = useState("");
  const [sortBy, setSortBy] = useState<"match" | "name" | "price">("match");
  const { isAdmin, venueProfile } = useAuth();
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    const cached = getCachedValue<Tables<"dj_profiles">[]>(cacheKey, { allowStale: true });
    if (cached) {
      setAllDjs(cached);
      setLoading(false);
    }

    cachedRequest(cacheKey, async () => {
      const { data } = await supabase.from("dj_profiles").select("*").eq("status", "active").order("created_at", { ascending: false });
      return data ?? [];
    }).then((data) => {
      setAllDjs(data);
      data.forEach((dj) => setCachedValue(`dj:${dj.id}`, dj));
      setLoading(false);
    });
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
      const q = deferredSearch.toLowerCase();
      list = list.filter((d) =>
        d.name.toLowerCase().includes(q) ||
        d.city.toLowerCase().includes(q) ||
        d.styles.some((s) => s.toLowerCase().includes(q))
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
    } else {
      list.sort((a, b) => a.name.localeCompare(b.name));
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

        <div className="relative mb-4">
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
            <select className={selectCls} value={sortBy} onChange={(e) => setSortBy(e.target.value as "match" | "name" | "price")}>
              <option value="match">Лучшие совпадения</option>
              <option value="name">По имени</option>
              <option value="price">По цене</option>
            </select>
            {hasActiveFilters && (
              <button onClick={resetFilters} className="text-[10px] text-primary hover:underline ml-1">
                Сбросить
              </button>
            )}
          </div>
        )}

        {loading ? (
          <CatalogCarousel
            items={[] as Tables<"dj_profiles">[]}
            loading
            variant="dj"
            getKey={(dj) => dj.id}
            renderItem={() => null}
          />
        ) : filtered.length > 0 ? (
          <CatalogCarousel
            items={filtered}
            variant="dj"
            getKey={(dj) => dj.id}
            renderItem={(dj, i, isActive) => (
              <DjCard
                dj={dj}
                index={i}
                isAdmin={isAdmin}
                isCarouselActive={isActive}
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
