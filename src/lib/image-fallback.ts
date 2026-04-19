import djThededzzy from "@/assets/dj-thededzzy.jpg";
import djDegoga from "@/assets/dj-degoga.jpg";
import venueMox from "@/assets/venue-mox.jpg";
import venueLoungeCoste from "@/assets/venue-lounge-coste.jpg";
import defaultCover from "@/assets/default-cover.jpg";

const DJ_IMAGES: Record<string, string> = {
  thededzzy: djThededzzy,
  degoga: djDegoga,
};

const VENUE_IMAGES: Record<string, string> = {
  "мох": venueMox,
  "lounge coste": venueLoungeCoste,
};

export function getDjImage(name: string, imageUrl: string | null | undefined): string {
  if (imageUrl) return imageUrl;
  const key = name.toLowerCase();
  return DJ_IMAGES[key] || defaultCover;
}

export function getVenueImage(name: string, imageUrl: string | null | undefined): string {
  if (imageUrl) return imageUrl;
  const key = name.toLowerCase();
  return VENUE_IMAGES[key] || defaultCover;
}
