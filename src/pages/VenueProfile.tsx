import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useReviewsForProfile, useVenuePostsByVenue } from "@/hooks/useMarketplace";
import { MapPin, ArrowLeft, Disc, Utensils, Star, ExternalLink } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import VenuePostCard from "@/components/VenuePostCard";
import { getCityLabel } from "@/lib/geography";
import { getVenueImage } from "@/lib/image-fallback";
import {
  VENUE_TYPE_OPTIONS,
  VENUE_CONDITIONS_OPTIONS,
  VENUE_EQUIPMENT_OPTIONS,
  getVenueOptionLabel,
} from "@/lib/venueOptions";
import { getCachedValue, setCachedValue } from "@/lib/requestCache";

const VenueProfile = () => {
  const { id } = useParams();
  const [venue, setVenue] = useState<Tables<"venue_profiles"> | null>(() => {
    const cached = id ? getCachedValue<Tables<"venue_profiles">>(`venue:${id}`) : null;
    return cached?.status === "active" ? cached : null;
  });
  const [loading, setLoading] = useState(() => {
    const cached = id ? getCachedValue<Tables<"venue_profiles">>(`venue:${id}`) : null;
    return id ? cached?.status !== "active" : true;
  });
  const [showReviews, setShowReviews] = useState(false);
  const { posts } = useVenuePostsByVenue(id);
  const reviewData = useReviewsForProfile(id);

  useEffect(() => {
    let isMounted = true;

    const fetchVenue = async () => {
      if (!id) {
        if (!isMounted) return;
        setVenue(null);
        setLoading(false);
        return;
      }

      const cacheKey = `venue:${id}`;
      const cached = getCachedValue<Tables<"venue_profiles">>(cacheKey);
      if (cached?.status === "active") {
        setVenue(cached);
        setLoading(false);
      } else {
        setLoading(true);
      }

      const { data, error } = await supabase
        .from("venue_profiles")
        .select("*")
        .eq("id", id)
        .eq("status", "active")
        .maybeSingle();

      if (!isMounted) return;

      if (error) {
        console.error("Ошибка загрузки venue:", error);
        setVenue(null);
        setLoading(false);
        return;
      }

      if (data) setCachedValue(cacheKey, data);
      setVenue(data ?? null);
      setLoading(false);
    };

    void fetchVenue();

    return () => {
      isMounted = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center pt-20">
        <p className="text-muted-foreground">Загрузка...</p>
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="flex min-h-screen items-center justify-center pt-20">
        <div className="space-y-3 text-center">
          <p className="font-medium text-foreground">Заведение не найдено</p>
          <Link
            to="/venues"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Назад к заведениям
          </Link>
        </div>
      </div>
    );
  }

  const venueTypeLabel = getVenueOptionLabel(
    venue.type,
    VENUE_TYPE_OPTIONS
  );

  const venueConditionLabel = getVenueOptionLabel(
    venue.food_drinks,
    VENUE_CONDITIONS_OPTIONS
  );

  const venueEquipmentLabel = getVenueOptionLabel(
    venue.equipment,
    VENUE_EQUIPMENT_OPTIONS
  );
  const heroImage = getVenueImage(venue.name, venue.image_url);

  return (
    <div className="min-h-screen pb-12">
      <section className="container mx-auto max-w-6xl px-4 pt-24 sm:pt-28">
        <div className="relative h-[280px] overflow-hidden rounded-2xl border border-white/5 bg-[#171a20] shadow-lg sm:h-[320px]">
        <img src={heroImage} alt={venue.name} className="absolute inset-0 h-full w-full object-cover object-center" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f1115] via-[#0f1115]/55 to-[#0f1115]/10" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0f1115]/85 via-[#0f1115]/28 to-transparent" />

        <div className="relative z-10 flex h-full flex-col justify-end p-5 sm:p-7">
          <Link
            to="/venues"
            className="mb-auto inline-flex w-fit max-w-full items-center gap-2 rounded-lg border border-white/5 bg-[#171a20] px-3 py-1.5 text-sm text-gray-200 shadow-lg transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <span>Назад</span>
          </Link>

          <div className="max-w-3xl space-y-4">
            <div className="space-y-3">
              <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium text-gray-300">
                <span className="inline-flex min-w-0 items-center gap-2">
                  <MapPin className="h-4 w-4 shrink-0 text-primary" />
                  <span className="truncate">{getCityLabel(venue.city)}</span>
                </span>
                {venue.address && <span className="min-w-0 truncate">{venue.address}</span>}
                <span className="inline-flex min-w-0 items-center gap-2">
                  <Star className={`h-4 w-4 shrink-0 ${reviewData.count > 0 ? "fill-primary text-primary" : "text-foreground/45"}`} />
                  <span className="truncate">{reviewData.count > 0 ? `${reviewData.averageRating.toFixed(1)} · ${reviewData.count} отзывов` : "Рейтинг появится скоро"}</span>
                </span>
              </div>
              <h1 className="line-clamp-2 break-words text-4xl font-bold leading-tight text-white drop-shadow sm:text-5xl">{venue.name}</h1>
              <div className="flex min-w-0 flex-wrap gap-2">
                {venue.type && <span className="max-w-full truncate rounded-full border border-primary/25 bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">{venueTypeLabel}</span>}
                {venue.music_styles.map((style) => (
                  <span key={style} className="max-w-full truncate rounded-full border border-white/5 bg-[#1c2027] px-3 py-1 text-xs font-semibold text-gray-200">{style}</span>
                ))}
              </div>
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <a href="#venue-posts" className="inline-flex min-w-0 items-center gap-2 rounded-lg border border-primary/35 bg-[#171a20] px-5 py-2.5 text-sm font-semibold text-primary shadow-lg transition-colors hover:bg-[#1c2027]">
                <ExternalLink className="h-4 w-4 shrink-0" /> <span>Публикации</span>
              </a>
            </div>
          </div>
        </div>
        </div>
      </section>

      <div className="container mx-auto max-w-6xl px-4 pt-8">
        <div className="grid gap-5 lg:grid-cols-[1.25fr_0.9fr]">
          <section className="premium-surface profile-section p-6">
            <p className="text-xs font-semibold uppercase text-primary">Описание</p>
            <h2 className="mt-2 text-2xl font-bold text-foreground">О площадке</h2>
            <p className="mt-3 text-sm leading-relaxed text-secondary-foreground">{venue.description || "Площадка пока не добавила описание."}</p>
          </section>

          <section className="premium-surface profile-section p-6 [animation-delay:80ms]">
            <p className="text-xs font-semibold uppercase text-primary">Контакты</p>
            <div className="mt-4 space-y-3 text-sm text-secondary-foreground">
              <p className="flex min-w-0 items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span className="min-w-0 break-words">{getCityLabel(venue.city)}{venue.address ? `, ${venue.address}` : ""}</span></p>
            </div>
          </section>

          <section className="premium-surface profile-section p-6 [animation-delay:120ms]">
            <p className="text-xs font-semibold uppercase text-primary">Оборудование</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {venue.equipment && (
                <div className="premium-row flex min-w-0 items-start gap-3 p-5">
                  <Disc className="h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="text-sm text-gray-400">Пульт и техника</p>
                    <p className="truncate text-sm font-semibold text-gray-200">{venueEquipmentLabel}</p>
                  </div>
                </div>
              )}
              {venue.food_drinks && (
                <div className="premium-row flex min-w-0 items-start gap-3 p-5">
                  <Utensils className="h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="text-sm text-gray-400">Условия</p>
                    <p className="truncate text-sm font-semibold text-gray-200">{venueConditionLabel}</p>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="premium-surface profile-section p-6 [animation-delay:160ms]">
            <p className="text-xs font-semibold uppercase text-primary">Рейтинг</p>
            <div className="mt-3 flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className={`h-5 w-5 ${i <= Math.round(reviewData.averageRating) ? "fill-primary text-primary" : "text-border"}`} />
              ))}
              {reviewData.count > 0 && <span className="text-sm font-semibold text-foreground">{reviewData.averageRating.toFixed(1)}</span>}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{reviewData.count > 0 ? `${reviewData.count} отзывов` : "Рейтинг появится после первых бронирований"}</p>
          </section>

          <section className="premium-surface profile-section p-6 lg:col-span-2 [animation-delay:200ms]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-primary">Отзывы</p>
                <h2 className="mt-1 text-xl font-bold text-foreground">Отзывы о площадке</h2>
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

          <section id="venue-posts" className="premium-surface profile-section p-6 lg:col-span-2 [animation-delay:240ms]">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase text-primary">Публикации</p>
              <h2 className="mt-1 text-xl font-bold text-foreground">Открытые выступления и кастинги</h2>
            </div>
            {posts.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {posts.map((post, index) => (
                  <VenuePostCard key={post.id} post={post} index={index} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">У площадки пока нет активных публикаций.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default VenueProfile;
