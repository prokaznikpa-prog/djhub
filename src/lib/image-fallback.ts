import defaultCover from "@/assets/default-cover.jpg";

export function getDjImage(_name: string, imageUrl: string | null | undefined): string {
  return imageUrl || defaultCover;
}

export function getVenueImage(_name: string, imageUrl: string | null | undefined): string {
  return imageUrl || defaultCover;
}
