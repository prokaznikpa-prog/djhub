import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Disc, Users, MapPin, Music, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import bgHero from "@/assets/bg-hero.jpg";

const Index = () => {
  const [djCount, setDjCount] = useState(0);
  const [venueCount, setVenueCount] = useState(0);
  const [postCount, setPostCount] = useState(0);

  useEffect(() => {
    supabase.from("dj_profiles").select("id", { count: "exact", head: true }).eq("status", "active").then(({ count }) => setDjCount(count ?? 0));
    supabase.from("venue_profiles").select("id", { count: "exact", head: true }).eq("status", "active").then(({ count }) => setVenueCount(count ?? 0));
    supabase.from("venue_posts").select("id", { count: "exact", head: true }).eq("status", "open").then(({ count }) => setPostCount(count ?? 0));
  }, []);

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-4 text-center overflow-hidden">
      <img src={bgHero} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
      <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background" />

      <div className="relative z-10 space-y-8 max-w-lg">
        <Disc className="mx-auto h-14 w-14 text-primary animate-spin" style={{ animationDuration: "8s" }} />
        <h1 className="text-5xl font-bold tracking-tight">
          <span className="text-primary neon-text">DJ</span>HUB
        </h1>
        <p className="text-muted-foreground text-lg">
          Маркетплейс для DJ и площадок. Находи выступления, кастинги и резидентства. Бронируй диджеев напрямую.
        </p>

        {/* Live stats */}
        <div className="flex justify-center gap-6 text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Users className="h-4 w-4 text-primary" />
            <span className="font-semibold text-foreground">{djCount}</span> DJ
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <MapPin className="h-4 w-4 text-primary" />
            <span className="font-semibold text-foreground">{venueCount}</span> площадок
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Music className="h-4 w-4 text-primary" />
            <span className="font-semibold text-foreground">{postCount}</span> возможностей
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/role-select"
            className="btn-glow inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Начать <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/djs"
            className="premium-row inline-flex items-center justify-center gap-2 px-8 py-3 text-sm font-medium text-foreground"
          >
            Смотреть как гость
          </Link>
        </div>

        <p className="text-xs text-muted-foreground/60">
          Уже есть аккаунт?{" "}
          <Link to="/login" className="text-primary hover:underline">Войти</Link>
        </p>
      </div>
    </div>
  );
};

export default Index;
