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
    className="card-hover rounded-xl border border-border bg-card overflow-hidden relative [content-visibility:auto] [contain-intrinsic-size:190px]"
    style={{ animationDelay: `${index * 60}ms` }}
    onMouseEnter={() => {
      preloadRoute(`/venue/${venue.id}`);
      setCachedValue(`venue:${venue.id}`, venue);
    }}
  >
    {isAdmin && (
      <div className="absolute top-2 right-2 z-10">
        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete?.(venue.id); }} className="p-1.5 rounded-full bg-background/60 backdrop-blur-sm hover:bg-muted transition-colors" title="Скрыть заведение из маркетплейса">
          <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
    )}
    <div className="aspect-[2/1] overflow-hidden">
      <img src={getVenueImage(venue.name, venue.image_url)} alt={venue.name} loading="lazy" decoding="async" className="card-img h-full w-full object-cover" />
    </div>
    <div className="px-2.5 py-2 space-y-1">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-foreground truncate">{venue.name}</h3>
        <span className="text-[9px] font-medium rounded-full bg-secondary px-1.5 py-px text-secondary-foreground shrink-0">{getVenueOptionLabel(venue.type, VENUE_TYPE_OPTIONS)}</span>
      </div>
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <MapPin className="h-2.5 w-2.5 shrink-0" />
        <span className="truncate">{getCityLabel(venue.city)}</span>
      </div>
      <div className="flex gap-1 flex-wrap">
        {venue.music_styles.slice(0, 2).map((s) => (
          <span key={s} className="pill-glow rounded-full bg-primary/10 border border-primary/20 px-1.5 py-px text-[9px] font-medium text-primary">
            {s}
          </span>
        ))}
      </div>
      {venue.description && <p className="text-[10px] text-muted-foreground line-clamp-1 leading-tight">{venue.description}</p>}
      <Link
        to={`/venue/${venue.id}`}
        onFocus={() => {
          preloadRoute(`/venue/${venue.id}`);
          setCachedValue(`venue:${venue.id}`, venue);
        }}
        className="btn-glow block w-full rounded-lg bg-primary/5 border border-primary/30 py-1 text-center text-[10px] font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
      >
        Подробнее
      </Link>
    </div>
  </div>
);

export default memo(VenueCard);
