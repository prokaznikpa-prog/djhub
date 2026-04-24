import type { Tables } from "@/integrations/supabase/types";
import type { DjProfile } from "@/lib/profile";

export type DjProfileRow = Tables<"dj_profiles">;

export type DjProfileModel = Omit<
  DjProfileRow,
  | "played_at"
  | "priority_style"
  | "open_to_collab"
  | "open_to_crew"
  | "image_url"
> & {
  playedAt: string[];
  priorityStyle: string;
  openToCollab: boolean;
  openToCrew: boolean;
  image: string | null;
} & DjProfile;

export function mapDjFromDb(row: DjProfileRow | null): DjProfileModel | null {
  if (!row) return null;

  const image = row.image_url ?? null;
  const styles = row.styles ?? [];
  const bio = row.bio ?? "";
  const priorityStyle = row.priority_style ?? styles[0] ?? "";
  const playedAt = row.played_at ?? [];
  const openToCollab = row.open_to_collab ?? false;
  const openToCrew = row.open_to_crew ?? false;

  return {
    ...row,
    kind: "dj",
    avatar: image,
    description: bio,
    styles,
    playedAt,
    priorityStyle,
    openToCollab,
    openToCrew,
    socials: [
      ...(row.soundcloud ? [{ label: "SoundCloud", url: row.soundcloud }] : []),
      ...(row.instagram ? [{ label: "Instagram", url: row.instagram }] : []),
    ],
    image,
    image_url: image,
    bio,
    experience: row.experience ?? "",
    availability: row.availability ?? "",
    price: row.price ?? "",
    priority_style: priorityStyle,
    played_at: playedAt,
    open_to_collab: openToCollab,
    open_to_crew: openToCrew,
  };
}

export function mapDjToDb(
  updates: Partial<DjProfileModel>
): Partial<DjProfileRow> {
  const result: Partial<DjProfileRow> = {};

  if ("name" in updates) result.name = updates.name;
  if ("city" in updates) result.city = updates.city;
  if ("contact" in updates) result.contact = updates.contact;
  if ("styles" in updates) result.styles = updates.styles;
  if ("priorityStyle" in updates) result.priority_style = updates.priorityStyle;
  if ("price" in updates) result.price = updates.price;
  if ("bio" in updates) result.bio = updates.bio;
  if ("experience" in updates) result.experience = updates.experience;
  if ("playedAt" in updates) result.played_at = updates.playedAt;
  if ("availability" in updates) result.availability = updates.availability;
  if ("openToCollab" in updates) result.open_to_collab = updates.openToCollab;
  if ("openToCrew" in updates) result.open_to_crew = updates.openToCrew;
  if ("image" in updates) result.image_url = updates.image;
  if ("is_verified" in updates) (result as any).is_verified = updates.is_verified;

  return result;
}

export function mapDjToLocalStorage(model: DjProfileModel | null) {
  if (!model) return null;

  return {
    ...model,
    kind: "dj",
    avatar: model.image,
    description: model.bio,
    played_at: model.playedAt,
    priority_style: model.priorityStyle,
    open_to_collab: model.openToCollab,
    open_to_crew: model.openToCrew,
    image_url: model.image,
  };
}
