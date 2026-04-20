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
  isCarouselActive?: boolean;
  onDelete?: (id: string) => void | Promise<void>;
}

const VenueCard = ({ venue, index = 0, isAdmin = false, isCarouselActive = false, onDelete }: VenueCardProps) => (
  <div
    className={`premium-card group relative aspect-[3/4] overflow-hidden will-change-transform [content-visibility:auto] [contain-intrinsic-size:260px] ${
      isCarouselActive ? "border-white/15 shadow-lg" : ""
    }`}
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
      className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-300 ease-out group-hover:scale-[1.01]"
    />
    <div className="absolute inset-0 bg-gradient-to-t from-[#0f1115] via-[#0f1115]/55 to-[#0f1115]/10" />
    <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#0f1115]/75 to-transparent" />

    {isAdmin && (
      <div className="absolute top-3 right-3 z-20">
        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete?.(venue.id); }} className="rounded-full border border-white/10 bg-background p-1.5 transition-colors hover:bg-[#1c2027]" title="Скрыть заведение из маркетплейса">
          <EyeOff className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </div>
    )}
    <div className="absolute inset-x-0 bottom-0 z-10 space-y-3 p-4">
      <div className="space-y-1">
        <div className="flex min-w-0 items-end justify-between gap-2">
          <h3 className="min-w-0 flex-1 truncate text-lg font-semibold leading-tight text-white drop-shadow">{venue.name}</h3>
          <span className="max-w-[46%] shrink-0 truncate rounded-full border border-primary/25 bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">{getVenueOptionLabel(venue.type, VENUE_TYPE_OPTIONS)}</span>
        </div>
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-gray-300">
          <MapPin className="h-4 w-4 shrink-0 text-primary/80" />
          <span className="min-w-0 truncate">{getCityLabel(venue.city)}</span>
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap gap-1.5">
        {venue.music_styles.slice(0, 2).map((s) => (
          <span key={s} className="max-w-full truncate rounded-full border border-white/5 bg-[#1c2027] px-2 py-0.5 text-[10px] font-medium text-gray-200">
            {s}
          </span>
        ))}
      </div>
      {(venue.equipment || venue.food_drinks) && (
        <div className="flex min-w-0 flex-wrap gap-1.5">
          {venue.equipment && (
            <span className="max-w-full truncate rounded-md border border-white/5 bg-[#171a20] px-2 py-1 text-[10px] font-medium text-gray-300">
              {getVenueOptionLabel(venue.equipment, VENUE_EQUIPMENT_OPTIONS)}
            </span>
          )}
          {venue.food_drinks && (
            <span className="max-w-full truncate rounded-md border border-white/5 bg-[#171a20] px-2 py-1 text-[10px] font-medium text-gray-300">
              {getVenueOptionLabel(venue.food_drinks, VENUE_CONDITIONS_OPTIONS)}
            </span>
          )}
        </div>
      )}
      {venue.description && <p className="line-clamp-1 break-words text-[11px] leading-relaxed text-gray-400">{venue.description}</p>}
      <Link
        to={`/venue/${venue.id}`}
        onFocus={() => {
          preloadRoute(`/venue/${venue.id}`);
          setCachedValue(`venue:${venue.id}`, venue);
        }}
        className="block min-w-0 translate-y-2 rounded-lg bg-primary py-2 text-center text-[10px] font-semibold text-primary-foreground opacity-0 shadow-lg transition-all duration-300 ease-out hover:bg-primary/90 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"
      >
        Открыть профиль
      </Link>
    </div>
  </div>
);

export default memo(VenueCard);
