import { useState } from "react";
import type { Gig } from "@/data/djhub-data";
import { Link } from "react-router-dom";
import { MapPin, Clock, Music, Tag, Heart } from "lucide-react";
import { isFavoriteGig, toggleFavoriteGig, getCurrentDjProfile } from "@/data/store";
import { getCityLabel } from "@/lib/geography";

const GigCard = ({ gig, index = 0 }: { gig: Gig; index?: number }) => {
  const isClosed = gig.status === "closed";
  const djProfile = getCurrentDjProfile();
  const [fav, setFav] = useState(() => isFavoriteGig(gig.id));

  const handleFav = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const newState = toggleFavoriteGig(gig.id);
    setFav(newState);
  };

  return (
    <div
      className={`group rounded-2xl border bg-card/60 overflow-hidden transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_6px_24px_-6px_hsl(0_0%_0%/0.4)] ${
        isClosed ? "border-border/30 opacity-60" : "border-border/40 hover:border-border/60"
      }`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="px-4 py-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground truncate">{gig.venueName}</h3>
          <div className="flex items-center gap-1.5">
            {djProfile && (
              <button onClick={handleFav} className="p-1 rounded-full hover:bg-primary/10 transition-colors">
                <Heart className={`h-3.5 w-3.5 transition-colors ${fav ? "text-primary fill-primary" : "text-muted-foreground"}`} />
              </button>
            )}
            <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${
              isClosed ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary"
            }`}>
              {isClosed ? "Закрыто" : "Открыто"}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 opacity-60" />
            {getCityLabel(gig.city)}
          </div>
          <span className="text-xs font-mono text-primary">{gig.budget}</span>
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><Clock className="h-3 w-3 opacity-60" />{gig.date} · {gig.time}</span>
          <span className="flex items-center gap-1"><Music className="h-3 w-3 opacity-60" />{gig.style}</span>
          {gig.format && <span className="flex items-center gap-1"><Tag className="h-3 w-3 opacity-60" />{gig.format}</span>}
        </div>

        {isClosed ? (
          <div className="w-full rounded-xl bg-muted/50 py-2 text-center text-[11px] font-medium text-muted-foreground">Набор завершён</div>
        ) : (
          <Link to={`/gig/${gig.id}`} className="block w-full rounded-xl bg-primary/10 py-2 text-center text-[11px] font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground">
            Подробнее
          </Link>
        )}
      </div>
    </div>
  );
};

export default GigCard;
