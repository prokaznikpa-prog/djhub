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
  isCarouselActive?: boolean;
  onDelete?: (id: string) => void | Promise<void>;
}

const DjCard = ({ dj, index = 0, isAdmin = false, isBestMatch = false, matchReasons = [], isCarouselActive = false, onDelete }: DjCardProps) => {
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
        className={`premium-card group relative aspect-[3/4] overflow-hidden will-change-transform [content-visibility:auto] [contain-intrinsic-size:260px] ${
          isCarouselActive ? "border-primary/35 shadow-[0_28px_70px_rgba(0,0,0,0.58)]" : ""
        }`}
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
          className={`absolute inset-0 h-full w-full object-cover object-[center_35%] transition-transform duration-500 ease-out ${
            isCarouselActive ? "scale-[1.015] group-hover:scale-[1.035]" : "group-hover:scale-[1.02]"
          }`}
        />
        <div className={`absolute inset-0 bg-gradient-to-t ${
          isCarouselActive
            ? "from-[#050608] via-[#0f1115]/70 to-[#0f1115]/5"
            : "from-[#0f1115] via-[#0f1115]/55 to-[#0f1115]/10"
        }`} />
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#0f1115]/75 to-transparent" />

        {(venueProfile || isAdmin) && (
          <div className="absolute top-3 right-3 z-20 flex items-center gap-1">
            {venueProfile && (
              <button onClick={handleInvite} className="rounded-full border border-white/5 bg-[#171a20] p-1.5 shadow-lg transition-colors hover:bg-[#1c2027]">
                <UserPlus className="h-4 w-4 shrink-0 text-primary" />
              </button>
            )}
            {isAdmin && (
              <button onClick={handleDelete} className="rounded-full border border-white/10 bg-background p-1.5 transition-colors hover:bg-[#1c2027]" title="Скрыть DJ из маркетплейса">
                <EyeOff className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            )}
          </div>
        )}

        {(isBestMatch || matchReasons.length > 0) && (
          <div className="absolute left-3 right-12 top-3 z-10 flex min-w-0 flex-wrap items-center gap-1.5 text-[10px] font-medium">
            {isBestMatch && <span className="rounded-full border border-primary/25 bg-background px-2 py-0.5 text-primary shadow-sm">🔥 Лучшее совпадение</span>}
            {matchReasons.slice(0, 2).map((reason) => (
              <span key={reason} className="premium-chip max-w-full truncate px-2 py-0.5">{reason}</span>
            ))}
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 opacity-0" aria-hidden="true" />

        <div className="absolute inset-x-0 bottom-0 z-10 space-y-3 p-4">
          <div className="flex min-w-0 items-end justify-between gap-2">
            <h3 className={`min-w-0 flex-1 truncate font-semibold leading-tight text-white drop-shadow ${
              isCarouselActive ? "text-xl" : "text-lg"
            }`}>{dj.name}</h3>
            <span className="max-w-[46%] shrink-0 truncate rounded-full border border-primary/25 bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">{formatPrice(dj.price)}</span>
          </div>
          <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-gray-300">
            <MapPin className="h-4 w-4 shrink-0 text-primary/80" />
            <span className="min-w-0 truncate">{getCityLabel(dj.city)}</span>
          </div>
          <div className="flex min-w-0 flex-wrap gap-1.5">
            {dj.styles.slice(0, 2).map((s) => (
              <span key={s} className="max-w-full truncate rounded-full border border-white/5 bg-[#1c2027] px-2 py-0.5 text-[10px] font-medium text-gray-200">{s}</span>
            ))}
          </div>
          {dj.bio && <p className="line-clamp-1 break-words text-[11px] leading-relaxed text-gray-400">{dj.bio}</p>}

          <div
            className={`flex gap-2 pt-1 transition-all duration-300 ease-out ${
              hovered || isCarouselActive ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
            } group-focus-within:translate-y-0 group-focus-within:opacity-100`}
          >
            <Link
              to={`/dj/${dj.id}`}
              onFocus={() => {
                preloadRoute(`/dj/${dj.id}`);
                setCachedValue(`dj:${dj.id}`, dj);
              }}
              className="min-w-0 flex-1 rounded-lg bg-primary py-2 text-center text-[10px] font-semibold text-primary-foreground shadow-lg transition-colors hover:bg-primary/90"
            >
              Открыть профиль
            </Link>

            <a
              href={dj.contact}
              target="_blank"
              rel="noopener noreferrer"
              className="flex shrink-0 items-center justify-center rounded-lg border border-white/5 bg-[#171a20] px-3 py-2 text-[10px] font-medium text-gray-200 transition-colors hover:border-primary/40 hover:text-primary"
            >
              <ExternalLink className="h-4 w-4 shrink-0" />
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
