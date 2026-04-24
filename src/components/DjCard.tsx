import { memo, useState } from "react";
import { Link } from "react-router-dom";
import { EyeOff, MapPin, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import InviteDjModal from "@/components/InviteDjModal";
import { getDjImage } from "@/lib/image-fallback";
import type { Tables } from "@/integrations/supabase/types";
import { formatPrice } from "@/lib/utils";
import { getCityLabel } from "@/lib/geography";
import { preloadRoute } from "@/lib/routePreload";
import { setCachedValue } from "@/lib/requestCache";
import VerificationBadge, { getVerificationKind } from "@/components/VerificationBadge";

type DjProfileRow = Tables<"dj_profiles">;

interface DjCardProps {
  dj: DjProfileRow;
  index?: number;
  isAdmin?: boolean;
  isBestMatch?: boolean;
  matchReasons?: string[];
  onDelete?: (id: string) => void | Promise<void>;
}

const DjCard = ({ dj, isAdmin = false, isBestMatch = false, matchReasons = [], onDelete }: DjCardProps) => {
  const { venueProfile } = useAuth();
  const [showInvite, setShowInvite] = useState(false);
  const verificationKind = getVerificationKind(dj);

  const handleInvite = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setShowInvite(true);
  };

  const handleDelete = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onDelete?.(dj.id);
  };

  return (
    <>
      <article
        className="group relative flex h-[312px] w-full min-w-0 flex-col overflow-hidden rounded-[18px] border border-white/10 bg-white/5 shadow-[0_16px_34px_rgba(0,0,0,0.26)] backdrop-blur-sm transition-[transform,box-shadow,border-color] duration-200 ease-out will-change-transform hover:-translate-y-1 hover:scale-[1.02] hover:border-white/15 hover:shadow-[0_20px_40px_rgba(0,0,0,0.34)] sm:h-[322px]"
        onMouseEnter={() => {
          preloadRoute(`/dj/${dj.id}`);
          setCachedValue(`dj:${dj.id}`, dj);
        }}
      >
        <img
          src={getDjImage(dj.name, dj.image_url)}
          alt={dj.name}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-200 ease-out group-hover:scale-[1.02]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

        <div className="relative z-10 flex h-full min-h-0 flex-col justify-between p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex max-w-[70%] flex-wrap gap-1">
            {isBestMatch && (
              <span className="truncate rounded-full border border-white/10 bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold text-primary backdrop-blur-md">
                🔥 Лучшее совпадение
              </span>
            )}
            {matchReasons.slice(0, isBestMatch ? 1 : 2).map((reason) => (
              <span key={reason} className="truncate rounded-full border border-white/10 bg-black/50 px-1.5 py-0.5 text-[9px] font-medium text-gray-200 backdrop-blur-md">
                {reason}
              </span>
            ))}
            </div>

            {(venueProfile || isAdmin) && (
              <div className="flex items-center gap-1">
              {venueProfile && (
                <button
                  type="button"
                  onClick={handleInvite}
                  className="rounded-full border border-white/10 bg-black/45 p-1.5 text-primary shadow-sm backdrop-blur-sm transition-colors hover:bg-black/65"
                  aria-label="Пригласить DJ"
                >
                  <UserPlus className="h-3.5 w-3.5 shrink-0" />
                </button>
              )}
              {isAdmin && (
                <button
                  type="button"
                  onClick={handleDelete}
                  className="rounded-full border border-white/10 bg-black/45 p-1.5 text-gray-200 shadow-sm backdrop-blur-sm transition-colors hover:bg-black/65"
                  aria-label="Скрыть DJ"
                >
                  <EyeOff className="h-3.5 w-3.5 shrink-0" />
                </button>
              )}
              </div>
            )}
          </div>

          <div className="mt-auto flex min-h-0 flex-col gap-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="inline-flex max-w-full min-w-0 items-center gap-1.5 align-middle">
                  <h3 className="min-w-0 truncate text-sm font-semibold leading-tight text-white">{dj.name}</h3>
                  <VerificationBadge kind={verificationKind} className="translate-y-[0.5px]" />
                </div>
                <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-gray-300">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="min-w-0 truncate">{getCityLabel(dj.city)}</span>
                </div>
              </div>
              <div className="price-pill shrink-0 shadow-[0_10px_22px_rgba(239,68,68,0.28)]">{formatPrice(dj.price)}</div>
            </div>

            <div className="flex min-w-0 flex-wrap gap-1">
              {dj.styles.slice(0, 2).map((style) => (
                <span key={style} className="max-w-full truncate rounded-full border border-white/10 bg-black/35 px-1.5 py-0.5 text-[9px] font-medium text-gray-100 backdrop-blur-sm">
                  {style}
                </span>
              ))}
            </div>

            <div className="pt-1.5">
            <Link
              to={`/dj/${dj.id}`}
              onFocus={() => {
                preloadRoute(`/dj/${dj.id}`);
                setCachedValue(`dj:${dj.id}`, dj);
              }}
              className="inline-flex h-9 items-center justify-center self-start rounded-lg bg-primary px-3.5 text-[10px] font-semibold text-primary-foreground shadow-[0_10px_22px_rgba(239,68,68,0.22)] transition-[transform,background-color,box-shadow] duration-200 hover:bg-primary/90 hover:shadow-[0_12px_26px_rgba(239,68,68,0.28)]"
            >
              Открыть профиль
            </Link>
            </div>
          </div>
        </div>
      </article>

      {showInvite && venueProfile && (
        <InviteDjModal venueId={venueProfile.id} djId={dj.id} djName={dj.name} onClose={() => setShowInvite(false)} />
      )}
    </>
  );
};

export default memo(DjCard);
