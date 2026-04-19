import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useReviewsForProfile, useVenuePostsByVenue } from "@/hooks/useMarketplace";
import { MapPin, ArrowLeft, Disc, Utensils, Phone, Star } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import VenuePostCard from "@/components/VenuePostCard";
import { getCityLabel } from "@/lib/geography";
import {
  VENUE_TYPE_OPTIONS,
  VENUE_CONDITIONS_OPTIONS,
  VENUE_EQUIPMENT_OPTIONS,
  getVenueOptionLabel,
} from "@/lib/venueOptions";
import { cachedRequest, getCachedValue, setCachedValue } from "@/lib/requestCache";

const VenueProfile = () => {
  const { id } = useParams();
  const [venue, setVenue] = useState<Tables<"venue_profiles"> | null>(() => id ? getCachedValue<Tables<"venue_profiles">>(`venue:${id}`) : null);
  const [loading, setLoading] = useState(() => id ? !getCachedValue<Tables<"venue_profiles">>(`venue:${id}`) : true);
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
      if (cached) {
        setVenue(cached);
        setLoading(false);
      } else {
        setLoading(true);
      }

      const data = await cachedRequest<Tables<"venue_profiles"> | null>(cacheKey, async () => {
        const { data, error } = await supabase
          .from("venue_profiles")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        if (error) {
          console.error("Failed to load venue", error);
          return null;
        }
        return data;
      });
      const error = null;

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

  return (
    <div className="min-h-screen pt-20 pb-12">
      <div className="container mx-auto max-w-5xl px-4">
        <Link
          to="/venues"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Назад
        </Link>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {venue.image_url ? (
            <div className="aspect-[16/9] overflow-hidden">
              <img
                src={venue.image_url}
                alt={venue.name}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div className="flex aspect-[16/9] items-center justify-center bg-muted/20 text-sm text-muted-foreground">
              Фото пока не добавлено
            </div>
          )}

          <div className="space-y-4 p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h1 className="text-2xl font-bold text-foreground">
                {venue.name}
              </h1>

              {venue.type && (
                <span className="w-fit rounded-full bg-secondary px-3 py-1 text-sm font-medium text-secondary-foreground">
                  {venueTypeLabel}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4" />
                <span>{getCityLabel(venue.city)}</span>
              </div>

              {venue.address && (
                <span className="text-sm">· {venue.address}</span>
              )}
            </div>

            {venue.contact && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="h-4 w-4" />
                <span>{venue.contact}</span>
              </div>
            )}

            {venue.description && (
              <p className="text-secondary-foreground">{venue.description}</p>
            )}

            {venue.music_styles && venue.music_styles.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {venue.music_styles.map((style) => (
                  <span
                    key={style}
                    className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary"
                  >
                    {style}
                  </span>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 border-t border-border pt-2 text-sm sm:grid-cols-2">
              {venue.equipment && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Disc className="h-4 w-4" />
                  <span>{venueEquipmentLabel}</span>
                </div>
              )}

              {venue.food_drinks && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Utensils className="h-4 w-4" />
                  <span>{venueConditionLabel}</span>
                </div>
              )}
            </div>

            <div className="border-t border-border pt-3">
              <div className="mb-1 flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} className={`h-4 w-4 ${i <= Math.round(reviewData.averageRating) ? "fill-primary text-primary" : "text-border"}`} />
                ))}
                {reviewData.count > 0 && <span className="text-xs font-semibold text-foreground">{reviewData.averageRating.toFixed(1)}</span>}
              </div>
              <p className="text-[11px] text-muted-foreground/60">
                {reviewData.count > 0 ? `${reviewData.count} отзывов` : "Рейтинг появится после первых бронирований"}
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

            {posts.length > 0 && (
              <div className="space-y-3 border-t border-border pt-2">
                <h3 className="text-lg font-semibold">Публикации</h3>

                <div className="grid gap-2">
                  {posts.map((post, index) => (
                    <VenuePostCard key={post.id} post={post} index={index} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VenueProfile;
