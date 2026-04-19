import { useCallback, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import VenueCard from "@/components/VenueCard";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import type { Tables } from "@/integrations/supabase/types";
import { cachedRequest, getCachedValue, setCachedValue } from "@/lib/requestCache";

const VenueCatalog = () => {
  const cacheKey = "catalog:venues:active";
  const [venues, setVenues] = useState<Tables<"venue_profiles">[]>(() => getCachedValue<Tables<"venue_profiles">[]>(cacheKey, { allowStale: true }) ?? []);
  const [loading, setLoading] = useState(() => !getCachedValue<Tables<"venue_profiles">[]>(cacheKey, { allowStale: true }));
  const { isAdmin } = useAuth();

  useEffect(() => {
    const cached = getCachedValue<Tables<"venue_profiles">[]>(cacheKey, { allowStale: true });
    if (cached) {
      setVenues(cached);
      setLoading(false);
    }

    cachedRequest(cacheKey, async () => {
      const { data } = await supabase.from("venue_profiles").select("*").eq("status", "active").order("created_at", { ascending: false });
      return data ?? [];
    }).then((data) => {
      setVenues(data);
      data.forEach((venue) => setCachedValue(`venue:${venue.id}`, venue));
      setLoading(false);
    });
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
    setVenues((prev) => prev.filter((venue) => venue.id !== id));
    toast.success("Заведение скрыто из маркетплейса");
  }, []);

  return (
    <div className="min-h-screen pt-20 pb-12">
      <div className="container mx-auto px-4">
        <h1 className="mb-6 text-2xl font-bold">
          <span className="text-primary neon-text">Заведения</span>
        </h1>
        {loading ? (
          <p className="text-muted-foreground text-center py-12 text-sm">Загрузка...</p>
        ) : venues.length === 0 ? (
          <p className="text-muted-foreground text-center py-12 text-sm">Нет заведений</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {venues.map((venue, i) => (
              <VenueCard key={venue.id} venue={venue} index={i} isAdmin={isAdmin} onDelete={handleDeleteVenue} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default VenueCatalog;
