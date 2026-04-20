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

  return (
    <div className="min-h-screen pt-20 pb-12">
      <div className="container mx-auto max-w-2xl px-4">
        <Link to="/djs" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Назад
        </Link>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {dj.image_url && (
            <div className="aspect-[16/9] overflow-hidden">
              <img src={dj.image_url} alt={dj.name} className="h-full w-full object-cover" />
            </div>
          )}
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold text-foreground">{dj.name}</h1>
              <div className="flex items-center gap-2">
                {venueProfile && (
                  <button onClick={() => setShowInvite(true)} className="flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors">
                    <UserPlus className="h-3.5 w-3.5" /> Пригласить
                  </button>
                )}
                <span className="font-mono text-lg text-primary">{dj.price}</span>
              </div>
            </div>
           <div className="flex items-center gap-2 text-muted-foreground">
  <MapPin className="h-4 w-4" />
  <span>{getCityLabel(dj.city)}</span>
</div>
            <div className="flex flex-wrap gap-2">
              {dj.styles.map((s) => (
                <span key={s} className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">{s}</span>
              ))}
            </div>
            {dj.bio && <p className="text-secondary-foreground">{dj.bio}</p>}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border text-sm">
              {dj.experience && <div className="flex items-center gap-2 text-muted-foreground"><Clock className="h-4 w-4" /><span>Опыт: {getDjExperienceLabel(dj.experience)}</span></div>}
              {dj.availability && <div className="flex items-center gap-2 text-muted-foreground"><Briefcase className="h-4 w-4" /><span>{getDjAvailabilityLabel(dj.availability)}</span></div>}
              <div className="flex items-center gap-2 text-muted-foreground"><Handshake className="h-4 w-4" /><span>Коллаборации: {dj.open_to_collab ? "Да" : "Нет"}</span></div>
              <div className="flex items-center gap-2 text-muted-foreground"><Users className="h-4 w-4" /><span>Участие в crew: {dj.open_to_crew ? "Да" : "Нет"}</span></div>
            </div>
            {dj.format && <div className="pt-2 border-t border-border text-sm text-muted-foreground">Формат: {dj.format}</div>}
            {dj.played_at && dj.played_at.length > 0 && (
              <div className="pt-2 border-t border-border">
                <p className="text-sm text-muted-foreground mb-1">Играл в:</p>
                <div className="flex flex-wrap gap-1.5">
                  {dj.played_at.map((place) => (
                    <span key={place} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">{place}</span>
                  ))}
                </div>
              </div>
            )}
            {(dj.soundcloud || dj.instagram) && (
              <div className="space-y-2 pt-2 border-t border-border">
                {dj.soundcloud && <a href={dj.soundcloud} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline"><ExternalLink className="h-3.5 w-3.5" /> SoundCloud</a>}
                {dj.instagram && <a href={dj.instagram} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline"><ExternalLink className="h-3.5 w-3.5" /> Instagram</a>}
              </div>
            )}
            <div className="pt-3 border-t border-border">
              <div className="flex items-center gap-2 mb-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} className={`h-4 w-4 ${i <= Math.round(reviewData.averageRating) ? "fill-primary text-primary" : "text-border"}`} />
                ))}
                {reviewData.count > 0 && <span className="text-xs font-semibold text-foreground">{reviewData.averageRating.toFixed(1)}</span>}
              </div>
              <p className="text-[11px] text-muted-foreground/60">
                {reviewData.count > 0 ? `${reviewData.count} отзывов` : "Рейтинг появится после первых выступлений"}
              </p>
              {reviewData.count > 0 && (
                <div className={showReviews ? "mt-2 max-h-48 space-y-2 overflow-y-auto pr-1" : "mt-2 space-y-2"}>
                  {(showReviews ? reviewData.reviews : reviewData.reviews.slice(0, 1)).map((review) => (
                    <div key={review.id} className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
                      <p className="text-[11px] font-semibold text-primary">{review.rating}/5</p>
                      {review.comment && <p className="mt-1 text-xs text-secondary-foreground">{review.comment}</p>}
                    </div>
                  ))}
                </div>
              )}
              {reviewData.count > 1 && (
                <button
                  type="button"
                  onClick={() => setShowReviews((value) => !value)}
                  className="mt-2 text-[11px] font-semibold text-primary hover:underline"
                >
                  {showReviews ? "Скрыть отзывы" : "Показать отзывы"}
                </button>
              )}
            </div>
            <a href={dj.contact} target="_blank" rel="noopener noreferrer" className="mt-4 block w-full rounded-xl bg-primary py-2.5 text-center text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
              Связаться
            </a>
          </div>
        </div>
      </div>

      {showInvite && venueProfile && dj && (
        <InviteDjModal venueId={venueProfile.id} djId={dj.id} djName={dj.name} onClose={() => setShowInvite(false)} />
      )}
    </div>
  );
};

export default DjProfile;
