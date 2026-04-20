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
      className={`premium-card group overflow-hidden [content-visibility:auto] [contain-intrinsic-size:180px] ${
        isClosed ? "opacity-60" : ""
      }`}
      style={{ animationDelay: `${index * 60}ms` }}
      onMouseEnter={() => {
        preloadRoute(`/post/${post.id}`);
        setCachedValue(`post:${post.id}`, post);
      }}
    >
        <div className="space-y-4 p-5">
        {(isBestMatch || matchReasons.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium">
            {isBestMatch && <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-primary">🔥 Лучшее совпадение</span>}
            {matchReasons.map((reason) => (
              <span key={reason} className="max-w-full truncate rounded-full border border-white/5 bg-[#1c2027] px-2 py-0.5 text-gray-300">{reason}</span>
            ))}
          </div>
        )}

        <div className="flex min-w-0 items-center justify-between gap-3">
          <h3 className="min-w-0 flex-1 truncate text-lg font-semibold text-white">{post.title}</h3>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${getGigTypeBadgeClass(post.post_type)}`}>
              {getGigTypeLabel(post.post_type)}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
              isClosed ? "border-white/10 bg-white/10 text-muted-foreground" : "border-primary/25 bg-primary/15 text-primary"
            }`}>
              {isClosed ? GIG_STATUS_LABEL.closed : GIG_STATUS_LABEL.open}
            </span>
          </div>
        </div>

        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 text-sm text-gray-400">
            <MapPin className="h-4 w-4 shrink-0 text-primary/70" />
            <span className="min-w-0 truncate">{getCityLabel(post.city)}</span>
          </div>
          {post.budget && <span className="max-w-[45%] shrink-0 truncate text-xs font-mono text-primary">{post.budget}</span>}
        </div>

        <div className="premium-row flex min-w-0 flex-wrap gap-x-3 gap-y-2 px-3 py-2 text-[11px] text-gray-400">
          {post.event_date && <span className="flex min-w-0 items-center gap-2"><Calendar className="h-4 w-4 shrink-0 opacity-70" /><span className="min-w-0 truncate">{post.event_date}</span></span>}
          {post.start_time && <span className="flex min-w-0 items-center gap-2"><Clock className="h-4 w-4 shrink-0 opacity-70" /><span className="min-w-0 truncate">{post.start_time}</span></span>}
          {post.music_styles.length > 0 && <span className="flex min-w-0 items-center gap-2"><Music className="h-4 w-4 shrink-0 opacity-70" /><span className="min-w-0 truncate">{post.music_styles.slice(0, 2).join(", ")}</span></span>}
          {post.frequency && <span className="flex min-w-0 items-center gap-2"><Briefcase className="h-4 w-4 shrink-0 opacity-70" /><span className="min-w-0 truncate">{post.frequency}</span></span>}
        </div>

        {post.description && (
          <p className="text-[10px] text-muted-foreground/70 line-clamp-2">{post.description}</p>
        )}

        {isClosed ? (
          <div className="w-full rounded-lg border border-white/5 bg-[#1c2027] py-2 text-center text-[11px] font-medium text-gray-400">Набор завершён</div>
        ) : (
          <Link to={`/post/${post.id}`} onFocus={() => {
            preloadRoute(`/post/${post.id}`);
            setCachedValue(`post:${post.id}`, post);
          }} className="block w-full rounded-lg bg-primary/10 py-2 text-center text-[11px] font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground">
            Подробнее
          </Link>
        )}
      </div>
    </div>
  );
};

export default memo(VenuePostCard);
