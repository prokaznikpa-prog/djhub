import { memo, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, ExternalLink, UserPlus, EyeOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import InviteDjModal from "@/components/InviteDjModal";
import { getDjImage } from "@/lib/image-fallback";
import type { Tables } from "@/integrations/supabase/types";
import { formatPrice } from "@/lib/utils";
import { getCityLabel } from "@/lib/geography";
import { preloadRoute } from "@/lib/routePreload";
import { setCachedValue } from "@/lib/requestCache";
type DjProfileRow = Tables<"dj_profiles">;

interface DjCardProps {
  dj: DjProfileRow;
  index?: number;
  isAdmin?: boolean;
  onDelete?: (id: string) => void | Promise<void>;
}

const DjCard = ({ dj, index = 0, isAdmin = false, onDelete }: DjCardProps) => {
  const [hovered, setHovered] = useState(false);
  const { venueProfile } = useAuth();
  const [showInvite, setShowInvite] = useState(false);

  const handleInvite = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowInvite(true);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDelete?.(dj.id);
  };

  return (
    <>
      <div
        className="group relative rounded-2xl bg-card/60 border border-border/40 overflow-hidden transition-[box-shadow,border-color] duration-300 ease-out hover:shadow-[0_8px_30px_-8px_hsl(var(--primary)/0.12),0_4px_20px_-4px_hsl(0_0%_0%/0.4)] hover:border-border/60 will-change-auto [content-visibility:auto] [contain-intrinsic-size:220px]"
        style={{ animationDelay: `${index * 60}ms` }}
        onMouseEnter={() => {
          setHovered(true);
          preloadRoute(`/dj/${dj.id}`);
          setCachedValue(`dj:${dj.id}`, dj);
        }}
        onMouseLeave={() => setHovered(false)}
      >
        {(venueProfile || isAdmin) && (
          <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
            {venueProfile && (
              <button onClick={handleInvite} className="p-1.5 rounded-full bg-background/60 backdrop-blur-sm hover:bg-background/80 transition-colors">
                <UserPlus className="h-3.5 w-3.5 text-primary" />
              </button>
            )}
            {isAdmin && (
              <button onClick={handleDelete} className="p-1.5 rounded-full bg-background/60 backdrop-blur-sm hover:bg-muted transition-colors" title="Скрыть DJ из маркетплейса">
                <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        )}

        <div className="aspect-[2/1] overflow-hidden">
          <img src={getDjImage(dj.name, dj.image_url)} alt={dj.name} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]" />
        </div>

        <div className="px-3 py-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground truncate">{dj.name}</h3>
            <span className="text-[11px] font-mono text-primary shrink-0 ml-2">{formatPrice(dj.price)}</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0 opacity-60" />
            <span className="truncate">{getCityLabel(dj.city)}</span>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {dj.styles.slice(0, 2).map((s) => (
              <span key={s} className="rounded-full bg-primary/8 px-2 py-0.5 text-[10px] font-medium text-primary/80">{s}</span>
            ))}
          </div>
          {dj.bio && <p className="text-[10px] text-muted-foreground/70 line-clamp-1 leading-relaxed">{dj.bio}</p>}

          <div className="relative pt-1 h-9">
  <div
    className={`absolute inset-0 flex gap-2 transition-opacity duration-200 ${
      hovered ? "opacity-100" : "opacity-0 pointer-events-none"
    }`}
  >
    <Link
      to={`/dj/${dj.id}`}
      onFocus={() => {
        preloadRoute(`/dj/${dj.id}`);
        setCachedValue(`dj:${dj.id}`, dj);
      }}
      className="flex-1 rounded-lg bg-primary/10 py-1.5 text-center text-[10px] font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
    >
      Профиль
    </Link>

    <a
      href={dj.contact}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-center gap-1 rounded-lg bg-card border border-border/50 px-3 py-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:text-primary hover:border-primary/30"
    >
      <ExternalLink className="h-2.5 w-2.5" />
    </a>
  </div>

  <div
    className={`absolute inset-0 transition-opacity duration-200 ${
      hovered ? "opacity-0 pointer-events-none" : "opacity-100"
    }`}
  >
    <Link
      to={`/dj/${dj.id}`}
      className="block w-full rounded-lg bg-primary/6 py-1.5 text-center text-[10px] font-medium text-primary/70 transition-colors hover:bg-primary/10 hover:text-primary"
    >
      Открыть профиль
    </Link>
  </div>
</div>
        </div>
      </div>

      {showInvite && venueProfile && (
        <InviteDjModal venueId={venueProfile.id} djId={dj.id} djName={dj.name} onClose={() => setShowInvite(false)} />
      )}
    </>
  );
};

export default memo(DjCard);
