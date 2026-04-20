import { Link } from "react-router-dom";
import { memo } from "react";
import { MapPin, EyeOff } from "lucide-react";
import { getVenueImage } from "@/lib/image-fallback";
import type { Tables } from "@/integrations/supabase/types";
import { getCityLabel } from "@/lib/geography";
import {
  VENUE_TYPE_OPTIONS,
  VENUE_EQUIPMENT_OPTIONS,
  VENUE_CONDITIONS_OPTIONS,
  getVenueOptionLabel,
} from "@/lib/venueOptions";
import { preloadRoute } from "@/lib/routePreload";
import { setCachedValue } from "@/lib/requestCache";
type VenueProfileRow = Tables<"venue_profiles">;

interface VenueCardProps {
  venue: VenueProfileRow;
  index?: number;
  isAdmin?: boolean;
  onDelete?: (id: string) => void | Promise<void>;
}

const VenueCard = ({ venue, index = 0, isAdmin = false, onDelete }: VenueCardProps) => (
  <div
    className="premium-card group relative aspect-[3/4] overflow-hidden will-change-transform [content-visibility:auto] [contain-intrinsic-size:260px]"
    style={{ animationDelay: `${index * 60}ms` }}
    onMouseEnter={() => {
      preloadRoute(`/venue/${venue.id}`);
      setCachedValue(`venue:${venue.id}`, venue);
    }}
  >
    <img
      src={getVenueImage(venue.name, venue.image_url)}
      alt={venue.name}
      loading="lazy"
      decoding="async"
      className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.08]"
    />
    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/45 to-background/10" />
    <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-background/55 to-transparent" />

    {isAdmin && (
      <div className="absolute top-3 right-3 z-20">
        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete?.(venue.id); }} className="rounded-full border border-white/10 bg-background/60 p-1.5 backdrop-blur-md transition-colors hover:bg-background/85" title="Скрыть заведение из маркетплейса">
          <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
    )}
    <div className="absolute inset-x-0 bottom-0 z-10 space-y-2 p-3">
      <div className="space-y-1">
        <div className="flex items-end justify-between gap-2">
          <h3 className="min-w-0 truncate text-base font-bold leading-tight text-foreground drop-shadow">{venue.name}</h3>
          <span className="shrink-0 rounded-full border border-primary/25 bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary backdrop-blur-md">{getVenueOptionLabel(venue.type, VENUE_TYPE_OPTIONS)}</span>
        </div>
        <div className="flex items-center gap-1 text-[11px] font-medium text-foreground/75">
          <MapPin className="h-3 w-3 shrink-0 text-primary/80" />
          <span className="truncate">{getCityLabel(venue.city)}</span>
        </div>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {venue.music_styles.slice(0, 2).map((s) => (
          <span key={s} className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] font-medium text-foreground/80 backdrop-blur-md">
            {s}
          </span>
        ))}
      </div>
      {venue.description && <p className="text-[10px] text-foreground/60 line-clamp-1 leading-tight">{venue.description}</p>}
      <Link
        to={`/venue/${venue.id}`}
        onFocus={() => {
          preloadRoute(`/venue/${venue.id}`);
          setCachedValue(`venue:${venue.id}`, venue);
        }}
        className="block translate-y-2 rounded-lg bg-primary py-2 text-center text-[10px] font-semibold text-primary-foreground opacity-0 shadow-lg shadow-primary/20 transition-all duration-300 ease-out hover:bg-primary/90 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"
      >
        Открыть профиль
      </Link>
    </div>
  </div>
);

export default memo(VenueCard);
