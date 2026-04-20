import { Link, Navigate } from "react-router-dom";
import { Music, Building2, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import bgHero from "@/assets/bg-hero.jpg";

const RoleSelect = () => {
  const { user, djProfile, venueProfile, loading } = useAuth();

  // Already has a profile — skip
  if (!loading && user && (djProfile || venueProfile)) {
    return <Navigate to="/djs" replace />;
  }

  // Not logged in — go signup
  if (!loading && !user) {
    return <Navigate to="/signup" replace />;
  }

  return (
    <div className="relative min-h-screen flex">
      {/* Left — image panel */}
      <div className="hidden md:block md:w-1/2 relative">
        <img src={bgHero} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/30 to-background" />
        <div className="relative z-10 flex h-full flex-col items-start justify-end p-10">
          <h2 className="text-3xl font-bold">
            <span className="text-primary neon-text">DJ</span>HUB
          </h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-xs">
            Подключайся к андеграунд-сцене. Находи площадки, бронируй диджеев.
          </p>
        </div>
      </div>

      {/* Right — selection */}
      <div className="flex w-full md:w-1/2 flex-col items-center justify-center px-6 py-12">
        <h1 className="text-2xl font-bold mb-2">Кто вы?</h1>
        <p className="text-muted-foreground text-sm mb-8">Выберите роль для регистрации</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-sm">
          <Link
            to="/register?role=dj"
            className="premium-card flex flex-col items-center gap-3 p-6 text-center"
          >
            <Music className="h-9 w-9 text-primary" />
            <span className="text-base font-semibold">DJ</span>
            <span className="text-[11px] text-muted-foreground">Ищу выступления</span>
          </Link>
          <Link
            to="/register?role=venue"
            className="premium-card flex flex-col items-center gap-3 p-6 text-center"
          >
            <Building2 className="h-9 w-9 text-primary" />
            <span className="text-base font-semibold">Заведение</span>
            <span className="text-[11px] text-muted-foreground">Ищу диджеев</span>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default RoleSelect;
