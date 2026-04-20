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
  isBestMatch?: boolean;
  matchReasons?: string[];
  onDelete?: (id: string) => void | Promise<void>;
}

const DjCard = ({ dj, index = 0, isAdmin = false, isBestMatch = false, matchReasons = [], onDelete }: DjCardProps) => {
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
        className="premium-card group relative aspect-[3/4] overflow-hidden will-change-transform [content-visibility:auto] [contain-intrinsic-size:260px]"
        style={{ animationDelay: `${index * 60}ms` }}
        onMouseEnter={() => {
          setHovered(true);
          preloadRoute(`/dj/${dj.id}`);
          setCachedValue(`dj:${dj.id}`, dj);
        }}
        onMouseLeave={() => setHovered(false)}
      >
        <img
          src={getDjImage(dj.name, dj.image_url)}
          alt={dj.name}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.08]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/45 to-background/10" />
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-background/55 to-transparent" />

        {(venueProfile || isAdmin) && (
          <div className="absolute top-3 right-3 z-20 flex items-center gap-1">
            {venueProfile && (
              <button onClick={handleInvite} className="rounded-full border border-white/10 bg-background/60 p-1.5 backdrop-blur-md transition-colors hover:bg-background/85">
                <UserPlus className="h-3.5 w-3.5 text-primary" />
              </button>
            )}
            {isAdmin && (
              <button onClick={handleDelete} className="rounded-full border border-white/10 bg-background/60 p-1.5 backdrop-blur-md transition-colors hover:bg-background/85" title="Скрыть DJ из маркетплейса">
                <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        )}

        {(isBestMatch || matchReasons.length > 0) && (
          <div className="absolute left-3 right-12 top-3 z-10 flex flex-wrap items-center gap-1.5 text-[10px] font-medium">
            {isBestMatch && <span className="rounded-full border border-primary/25 bg-background/55 px-2 py-0.5 text-primary shadow-sm backdrop-blur-md">🔥 Лучшее совпадение</span>}
            {matchReasons.slice(0, 2).map((reason) => (
              <span key={reason} className="premium-chip px-2 py-0.5">{reason}</span>
            ))}
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 opacity-0" aria-hidden="true" />

        <div className="absolute inset-x-0 bottom-0 z-10 space-y-2 p-3">
          <div className="flex items-end justify-between gap-2">
            <h3 className="min-w-0 truncate text-base font-bold leading-tight text-foreground drop-shadow">{dj.name}</h3>
            <span className="shrink-0 rounded-full border border-primary/25 bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary backdrop-blur-md">{formatPrice(dj.price)}</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] font-medium text-foreground/75">
            <MapPin className="h-3 w-3 shrink-0 text-primary/80" />
            <span className="truncate">{getCityLabel(dj.city)}</span>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {dj.styles.slice(0, 2).map((s) => (
              <span key={s} className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] font-medium text-foreground/80 backdrop-blur-md">{s}</span>
            ))}
          </div>
          {dj.bio && <p className="text-[10px] text-foreground/60 line-clamp-1 leading-relaxed">{dj.bio}</p>}

          <div
            className={`flex gap-2 pt-1 transition-all duration-300 ease-out ${
              hovered ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
            } group-focus-within:translate-y-0 group-focus-within:opacity-100`}
          >
            <Link
              to={`/dj/${dj.id}`}
              onFocus={() => {
                preloadRoute(`/dj/${dj.id}`);
                setCachedValue(`dj:${dj.id}`, dj);
              }}
              className="flex-1 rounded-lg bg-primary py-2 text-center text-[10px] font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-colors hover:bg-primary/90"
            >
              Открыть профиль
            </Link>

            <a
              href={dj.contact}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center rounded-lg border border-white/15 bg-background/55 px-3 py-2 text-[10px] font-medium text-foreground/80 backdrop-blur-md transition-colors hover:border-primary/40 hover:text-primary"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
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
