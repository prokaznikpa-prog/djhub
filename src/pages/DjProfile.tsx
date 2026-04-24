import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useReviewsForProfile } from "@/domains/reviews/reviews.hooks";
import InviteDjModal from "@/components/InviteDjModal";
import { MapPin, ExternalLink, ArrowLeft, Clock, Briefcase, Users, Handshake, Star, Heart, UserPlus } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { getCityLabel } from "@/lib/geography";
import { getDjAvailabilityLabel } from "@/lib/djOptions";
import { getDjExperienceLabel } from "@/lib/djOptions";
import { getCachedValue, setCachedValue } from "@/lib/requestCache";
import { getDjImage } from "@/lib/image-fallback";
import VerificationBadge, { getVerificationKind } from "@/components/VerificationBadge";
const DjProfile = () => {
  const { id } = useParams();
  const { venueProfile } = useAuth();
  const [dj, setDj] = useState<Tables<"dj_profiles"> | null>(() => {
    const cached = id ? getCachedValue<Tables<"dj_profiles">>(`dj:${id}`) : null;
    return cached?.status === "active" ? cached : null;
  });
  const [loading, setLoading] = useState(() => {
    const cached = id ? getCachedValue<Tables<"dj_profiles">>(`dj:${id}`) : null;
    return id ? cached?.status !== "active" : true;
  });
  const [showInvite, setShowInvite] = useState(false);
  const [showReviews, setShowReviews] = useState(false);
  const reviewData = useReviewsForProfile(id);

  useEffect(() => {
    if (!id) return;
    const cacheKey = `dj:${id}`;
    const cached = getCachedValue<Tables<"dj_profiles">>(cacheKey);
    if (cached?.status === "active") {
      setDj(cached);
      setLoading(false);
    }
    supabase.from("dj_profiles").select("*").eq("id", id).eq("status", "active").maybeSingle().then(({ data }) => {
      if (data) setCachedValue(cacheKey, data);
      setDj(data);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <div className="min-h-screen pt-20 flex items-center justify-center"><p className="text-muted-foreground text-sm">Загрузка...</p></div>;

  if (!dj) {
    return (
      <div className="min-h-screen pt-20 flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground">DJ не найден</p>
          <Link to="/djs" className="text-sm text-primary hover:underline">← Назад в каталог</Link>
        </div>
      </div>
    );
  }

  const heroImage = getDjImage(dj.name, dj.image_url);
  const verificationKind = getVerificationKind(dj);

  return (
    <div className="min-h-screen pb-12">
      <section className="relative min-h-[clamp(430px,62vh,640px)] overflow-hidden pt-14">
        <img src={heroImage} alt={dj.name} className="absolute inset-0 h-full w-full object-cover object-center" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/58 to-background/8" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/38 to-background/12" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-background to-transparent" />

        <div className="container relative z-10 mx-auto flex min-h-[clamp(430px,62vh,640px)] max-w-6xl flex-col justify-end px-4 pb-10 pt-6 sm:pb-12">
          <Link to="/djs" className="mb-auto inline-flex w-fit max-w-full items-center gap-2 rounded-lg border border-white/5 bg-[#171a20] px-3 py-1.5 text-sm text-gray-200 shadow-lg transition-colors hover:text-white">
            <ArrowLeft className="h-4 w-4 shrink-0" /> <span>Назад</span>
          </Link>

          <div className="max-w-3xl space-y-4">
            <div className="space-y-3">
              <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium text-gray-300">
                <span className="inline-flex min-w-0 items-center gap-2">
                  <MapPin className="h-4 w-4 shrink-0 text-primary" />
                  <span className="truncate">{getCityLabel(dj.city)}</span>
                </span>
                <span className="inline-flex min-w-0 items-center gap-2">
                  <Star className={`h-4 w-4 shrink-0 ${reviewData.count > 0 ? "fill-primary text-primary" : "text-foreground/45"}`} />
                  <span className="truncate">{reviewData.count > 0 ? `${reviewData.averageRating.toFixed(1)} · ${reviewData.count} отзывов` : "Рейтинг появится скоро"}</span>
                </span>
              </div>
              <div className="inline-flex max-w-full min-w-0 items-center gap-1.5 align-middle">
                <h1 className="min-w-0 line-clamp-2 break-words text-4xl font-bold leading-tight text-white drop-shadow sm:text-5xl">{dj.name}</h1>
                <VerificationBadge kind={verificationKind} className="h-[18px] w-[18px] text-[10px]" />
              </div>
              <div className="flex min-w-0 flex-wrap gap-2">
                {dj.styles.map((s) => (
                  <span key={s} className="max-w-full truncate rounded-full border border-white/5 bg-[#1c2027] px-3 py-1 text-xs font-semibold text-gray-200">{s}</span>
                ))}
              </div>
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <span className="max-w-full truncate rounded-full border border-primary/30 bg-primary/15 px-4 py-2 text-sm font-bold text-primary">{dj.price}</span>
              {venueProfile && (
                <button onClick={() => setShowInvite(true)} className="inline-flex min-w-0 items-center gap-2 rounded-lg border border-primary/35 bg-[#171a20] px-5 py-2.5 text-sm font-semibold text-primary shadow-lg transition-colors hover:bg-[#1c2027]">
                  <UserPlus className="h-4 w-4 shrink-0" /> <span>Пригласить</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="container mx-auto max-w-6xl px-4 pt-6">
        <div className="grid gap-5 lg:grid-cols-[1.35fr_0.9fr]">
          <section className="premium-surface profile-section p-6">
            <p className="text-xs font-semibold uppercase text-primary">Описание</p>
            <h2 className="mt-2 text-2xl font-bold text-foreground">О DJ</h2>
            <p className="mt-3 text-sm leading-relaxed text-secondary-foreground">{dj.bio || "DJ пока не добавил описание."}</p>
          </section>

          <section className="premium-surface profile-section p-6 [animation-delay:80ms]">
            <p className="text-xs font-semibold uppercase text-primary">Рейтинг</p>
            <div className="mt-3 flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className={`h-5 w-5 ${i <= Math.round(reviewData.averageRating) ? "fill-primary text-primary" : "text-border"}`} />
              ))}
              {reviewData.count > 0 && <span className="text-sm font-semibold text-foreground">{reviewData.averageRating.toFixed(1)}</span>}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{reviewData.count > 0 ? `${reviewData.count} отзывов` : "Рейтинг появится после первых выступлений"}</p>
          </section>

          <section className="premium-surface profile-section p-6 [animation-delay:120ms]">
            <p className="text-xs font-semibold uppercase text-primary">Опыт и доступность</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {dj.experience && <div className="premium-row flex min-w-0 items-start gap-3 p-5"><Clock className="h-4 w-4 shrink-0 text-primary" /><div className="min-w-0"><p className="text-sm text-gray-400">Опыт</p><p className="truncate text-sm font-semibold text-gray-200">{getDjExperienceLabel(dj.experience)}</p></div></div>}
              {dj.availability && <div className="premium-row flex min-w-0 items-start gap-3 p-5"><Briefcase className="h-4 w-4 shrink-0 text-primary" /><div className="min-w-0"><p className="text-sm text-gray-400">Доступность</p><p className="truncate text-sm font-semibold text-gray-200">{getDjAvailabilityLabel(dj.availability)}</p></div></div>}
              <div className="premium-row flex min-w-0 items-start gap-3 p-5"><Handshake className="h-4 w-4 shrink-0 text-primary" /><div className="min-w-0"><p className="text-sm text-gray-400">Коллаборации</p><p className="truncate text-sm font-semibold text-gray-200">{dj.open_to_collab ? "Да" : "Нет"}</p></div></div>
              <div className="premium-row flex min-w-0 items-start gap-3 p-5"><Users className="h-4 w-4 shrink-0 text-primary" /><div className="min-w-0"><p className="text-sm text-gray-400">Участие в crew</p><p className="truncate text-sm font-semibold text-gray-200">{dj.open_to_crew ? "Да" : "Нет"}</p></div></div>
            </div>
            {dj.format && <p className="mt-4 text-sm text-muted-foreground">Формат: <span className="font-semibold text-foreground">{dj.format}</span></p>}
          </section>

          <section className="premium-surface profile-section p-6 [animation-delay:160ms]">
            <p className="text-xs font-semibold uppercase text-primary">Площадки</p>
            <h2 className="mt-2 text-xl font-bold text-foreground">Где играл</h2>
            {dj.played_at && dj.played_at.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {dj.played_at.map((place) => (
                  <span key={place} className="max-w-full truncate rounded-full border border-white/5 bg-[#1c2027] px-3 py-1 text-xs font-medium text-gray-200">{place}</span>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Площадки пока не указаны.</p>
            )}
            {(dj.soundcloud || dj.instagram) && (
              <div className="mt-5 space-y-2 border-t border-border/60 pt-4">
                {dj.soundcloud && <a href={dj.soundcloud} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-2 text-sm font-semibold text-primary transition-colors hover:text-primary/80"><ExternalLink className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">SoundCloud</span></a>}
                {dj.instagram && <a href={dj.instagram} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-2 text-sm font-semibold text-primary transition-colors hover:text-primary/80"><ExternalLink className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">Instagram</span></a>}
              </div>
            )}
          </section>

          <section className="premium-surface profile-section p-6 lg:col-span-2 [animation-delay:200ms]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-primary">Отзывы</p>
                <h2 className="mt-1 text-xl font-bold text-foreground">Что говорят после выступлений</h2>
              </div>
              {reviewData.count > 1 && (
                <button type="button" onClick={() => setShowReviews((value) => !value)} className="rounded-lg border border-primary/25 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10">
                  {showReviews ? "Скрыть" : "Показать все"}
                </button>
              )}
            </div>
            {reviewData.count > 0 ? (
              <div className={showReviews ? "grid max-h-72 gap-3 overflow-y-auto pr-1 sm:grid-cols-2" : "grid gap-3 sm:grid-cols-2"}>
                {(showReviews ? reviewData.reviews : reviewData.reviews.slice(0, 2)).map((review) => (
                  <div key={review.id} className="premium-row px-4 py-3">
                    <p className="text-xs font-semibold text-primary">{review.rating}/5</p>
                    {review.comment && <p className="mt-2 text-sm text-secondary-foreground">{review.comment}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Отзывы появятся после первых завершенных бронирований.</p>
            )}
          </section>
        </div>
      </div>

      {showInvite && venueProfile && dj && (
        <InviteDjModal venueId={venueProfile.id} djId={dj.id} djName={dj.name} onClose={() => setShowInvite(false)} />
      )}
    </div>
  );
};

export default DjProfile;
