import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useReviewsForProfile } from "@/hooks/useMarketplace";
import InviteDjModal from "@/components/InviteDjModal";
import { MapPin, ExternalLink, ArrowLeft, Clock, Briefcase, Users, Handshake, Star, Heart, UserPlus } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { getCityLabel } from "@/lib/geography";
import { getDjAvailabilityLabel } from "@/lib/djOptions";
import { getDjExperienceLabel } from "@/lib/djOptions";
import { getCachedValue, setCachedValue } from "@/lib/requestCache";
import { getDjImage } from "@/lib/image-fallback";
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

  return (
    <div className="min-h-screen pb-12">
      <section className="relative min-h-[520px] overflow-hidden pt-20">
        <img src={heroImage} alt={dj.name} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/65 to-background/15" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/85 via-background/30 to-transparent" />

        <div className="container relative z-10 mx-auto flex min-h-[500px] max-w-6xl flex-col justify-end px-4 pb-10">
          <Link to="/djs" className="mb-auto inline-flex w-fit items-center gap-1.5 rounded-lg border border-white/10 bg-background/45 px-3 py-1.5 text-sm text-foreground/80 backdrop-blur-md transition-colors hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Назад
          </Link>

          <div className="profile-section max-w-3xl space-y-5">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 text-sm font-medium text-foreground/80">
                <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 text-primary" />{getCityLabel(dj.city)}</span>
                <span className="inline-flex items-center gap-1.5">
                  <Star className={`h-4 w-4 ${reviewData.count > 0 ? "fill-primary text-primary" : "text-foreground/45"}`} />
                  {reviewData.count > 0 ? `${reviewData.averageRating.toFixed(1)} · ${reviewData.count} отзывов` : "Рейтинг появится скоро"}
                </span>
              </div>
              <h1 className="text-4xl font-bold leading-tight text-foreground drop-shadow sm:text-6xl">{dj.name}</h1>
              <div className="flex flex-wrap gap-2">
                {dj.styles.map((s) => (
                  <span key={s} className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-foreground/85 backdrop-blur-md">{s}</span>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-primary/30 bg-primary/15 px-4 py-2 text-sm font-bold text-primary backdrop-blur-md">{dj.price}</span>
              {venueProfile && (
                <button onClick={() => setShowInvite(true)} className="inline-flex items-center gap-2 rounded-lg border border-primary/35 bg-background/50 px-5 py-2.5 text-sm font-semibold text-primary backdrop-blur-md transition-colors hover:bg-primary/10">
                  <UserPlus className="h-4 w-4" /> Пригласить
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="container mx-auto max-w-6xl px-4 pt-8">
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
              {dj.experience && <div className="premium-row p-4"><Clock className="mb-2 h-4 w-4 text-primary" /><p className="text-xs text-muted-foreground">Опыт</p><p className="text-sm font-semibold text-foreground">{getDjExperienceLabel(dj.experience)}</p></div>}
              {dj.availability && <div className="premium-row p-4"><Briefcase className="mb-2 h-4 w-4 text-primary" /><p className="text-xs text-muted-foreground">Доступность</p><p className="text-sm font-semibold text-foreground">{getDjAvailabilityLabel(dj.availability)}</p></div>}
              <div className="premium-row p-4"><Handshake className="mb-2 h-4 w-4 text-primary" /><p className="text-xs text-muted-foreground">Коллаборации</p><p className="text-sm font-semibold text-foreground">{dj.open_to_collab ? "Да" : "Нет"}</p></div>
              <div className="premium-row p-4"><Users className="mb-2 h-4 w-4 text-primary" /><p className="text-xs text-muted-foreground">Участие в crew</p><p className="text-sm font-semibold text-foreground">{dj.open_to_crew ? "Да" : "Нет"}</p></div>
            </div>
            {dj.format && <p className="mt-4 text-sm text-muted-foreground">Формат: <span className="font-semibold text-foreground">{dj.format}</span></p>}
          </section>

          <section className="premium-surface profile-section p-6 [animation-delay:160ms]">
            <p className="text-xs font-semibold uppercase text-primary">Площадки</p>
            <h2 className="mt-2 text-xl font-bold text-foreground">Где играл</h2>
            {dj.played_at && dj.played_at.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {dj.played_at.map((place) => (
                  <span key={place} className="rounded-full border border-white/10 bg-background/50 px-3 py-1 text-xs font-medium text-secondary-foreground">{place}</span>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Площадки пока не указаны.</p>
            )}
            {(dj.soundcloud || dj.instagram) && (
              <div className="mt-5 space-y-2 border-t border-border/60 pt-4">
                {dj.soundcloud && <a href={dj.soundcloud} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm font-semibold text-primary transition-colors hover:text-primary/80"><ExternalLink className="h-3.5 w-3.5" /> SoundCloud</a>}
                {dj.instagram && <a href={dj.instagram} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm font-semibold text-primary transition-colors hover:text-primary/80"><ExternalLink className="h-3.5 w-3.5" /> Instagram</a>}
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
