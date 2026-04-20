import type { VenuePost } from "@/hooks/useMarketplace";
import { Link } from "react-router-dom";
import { memo } from "react";
import { MapPin, Clock, Music, Calendar, Briefcase } from "lucide-react";
import { GIG_STATUS_LABEL, getGigTypeBadgeClass, getGigTypeLabel, isOpenGig } from "@/lib/gigs";
import { getCityLabel } from "@/lib/geography";
import { preloadRoute } from "@/lib/routePreload";
import { setCachedValue } from "@/lib/requestCache";

interface VenuePostCardProps {
  post: VenuePost;
  index?: number;
  isBestMatch?: boolean;
  matchReasons?: string[];
}

const VenuePostCard = ({ post, index = 0, isBestMatch = false, matchReasons = [] }: VenuePostCardProps) => {
  const isClosed = !isOpenGig(post);

  return (
    <div
      className={`group rounded-2xl border bg-card/60 overflow-hidden transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_6px_24px_-6px_hsl(0_0%_0%/0.4)] [content-visibility:auto] [contain-intrinsic-size:170px] ${
        isClosed ? "border-border/30 opacity-60" : "border-border/40 hover:border-border/60"
      }`}
      style={{ animationDelay: `${index * 60}ms` }}
      onMouseEnter={() => {
        preloadRoute(`/post/${post.id}`);
        setCachedValue(`post:${post.id}`, post);
      }}
    >
        <div className="px-4 py-3.5 space-y-2.5">
        {(isBestMatch || matchReasons.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium">
            {isBestMatch && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">🔥 Лучшее совпадение</span>}
            {matchReasons.map((reason) => (
              <span key={reason} className="rounded-full bg-primary/5 px-2 py-0.5 text-primary/80">{reason}</span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground truncate">{post.title}</h3>
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${getGigTypeBadgeClass(post.post_type)}`}>
              {getGigTypeLabel(post.post_type)}
            </span>
            <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${
              isClosed ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary"
            }`}>
              {isClosed ? GIG_STATUS_LABEL.closed : GIG_STATUS_LABEL.open}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 opacity-60" />
            {getCityLabel(post.city)}
          </div>
          {post.budget && <span className="text-xs font-mono text-primary">{post.budget}</span>}
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {post.event_date && <span className="flex items-center gap-1"><Calendar className="h-3 w-3 opacity-60" />{post.event_date}</span>}
          {post.start_time && <span className="flex items-center gap-1"><Clock className="h-3 w-3 opacity-60" />{post.start_time}</span>}
          {post.music_styles.length > 0 && <span className="flex items-center gap-1"><Music className="h-3 w-3 opacity-60" />{post.music_styles.slice(0, 2).join(", ")}</span>}
          {post.frequency && <span className="flex items-center gap-1"><Briefcase className="h-3 w-3 opacity-60" />{post.frequency}</span>}
        </div>

        {post.description && (
          <p className="text-[10px] text-muted-foreground/70 line-clamp-2">{post.description}</p>
        )}

        {isClosed ? (
          <div className="w-full rounded-xl bg-muted/50 py-2 text-center text-[11px] font-medium text-muted-foreground">Набор завершён</div>
        ) : (
          <Link to={`/post/${post.id}`} onFocus={() => {
            preloadRoute(`/post/${post.id}`);
            setCachedValue(`post:${post.id}`, post);
          }} className="block w-full rounded-xl bg-primary/10 py-2 text-center text-[11px] font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground">
            Подробнее
          </Link>
        )}
      </div>
    </div>
  );
};

export default memo(VenuePostCard);
