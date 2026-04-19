import type { Tables } from "@/integrations/supabase/types";
import type { CityValue } from "@/lib/geography";
import type { VenueProfile } from "@/lib/profile";

export type VenueProfileRow = Tables<"venue_profiles">;

export type VenueProfileModel = Omit<
  VenueProfileRow,
  "city" | "music_styles" | "food_drinks" | "image_url"
> & {
  city: CityValue | string;
  music: string[];
  foodDrinks: string;
  image: string | null;
} & VenueProfile;

export function mapVenueFromDb(row: VenueProfileRow | null): VenueProfileModel | null {
  if (!row) return null;

  const image = row.image_url ?? null;
  const music = row.music_styles ?? [];
  const description = row.description ?? "";
  const foodDrinks = row.food_drinks ?? "";

  return {
    ...row,
    kind: "venue",
    city: (row.city as CityValue | string) ?? "",
    avatar: image,
    styles: music,
    music,
    music_styles: music,
    description,
    foodDrinks,
    food_drinks: foodDrinks,
    image,
    image_url: image,
    address: row.address ?? "",
    equipment: row.equipment ?? "",
  };
}

export function mapVenueToDb(
  updates: Partial<VenueProfileModel>
): Partial<VenueProfileRow> {
  const result: Partial<VenueProfileRow> = {};

  if ("name" in updates) result.name = updates.name;
  if ("city" in updates) result.city = updates.city;
  if ("contact" in updates) result.contact = updates.contact;
  if ("type" in updates) result.type = updates.type;
  if ("description" in updates) result.description = updates.description;
  if ("address" in updates) result.address = updates.address;
  if ("equipment" in updates) result.equipment = updates.equipment;
  if ("music" in updates) result.music_styles = updates.music;
  if ("foodDrinks" in updates) result.food_drinks = updates.foodDrinks;
  if ("image" in updates) result.image_url = updates.image;

  return result;
}

export function mergeVenueProfile(
  current: VenueProfileModel | null,
  updates: Partial<VenueProfileModel>
): VenueProfileModel | null {
  if (!current) return null;

  return {
    ...current,
    ...updates,
    kind: "venue",
    avatar: updates.image ?? current.image ?? null,
    styles: updates.music ?? current.music ?? [],
    music: updates.music ?? current.music ?? [],
    foodDrinks: updates.foodDrinks ?? current.foodDrinks ?? "",
    image: updates.image ?? current.image ?? null,
    address: updates.address ?? current.address ?? "",
    equipment: updates.equipment ?? current.equipment ?? "",
    description: updates.description ?? current.description ?? "",
  };
}

export function mapVenueToLocalStorage(model: VenueProfileModel | null) {
  if (!model) return null;

  return {
    ...model,
    kind: "venue",
    avatar: model.image,
    styles: model.music,
    music_styles: model.music,
    food_drinks: model.foodDrinks,
    image_url: model.image,
  };
}
