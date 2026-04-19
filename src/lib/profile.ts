import type { CityValue } from "@/lib/geography";

export type ProfileKind = "dj" | "venue";

export interface ProfileContact {
  primary: string;
  soundcloud?: string | null;
  instagram?: string | null;
}

export interface ProfileBase {
  id: string;
  user_id?: string | null;
  kind: ProfileKind;
  name: string;
  city: CityValue | string;
  contact: string;
  avatar: string | null;
  styles: string[];
  description: string;
  status?: string | null;
}

export interface DjProfile extends ProfileBase {
  kind: "dj";
  priorityStyle: string;
  price: string;
  experience: string;
  playedAt: string[];
  availability: string;
  format?: string | null;
  openToCollab: boolean;
  openToCrew: boolean;
  socials: { label: string; url: string }[];
  soundcloud?: string | null;
  instagram?: string | null;

  bio: string;
  image: string | null;
  image_url: string | null;
  priority_style: string;
  played_at: string[];
  open_to_collab: boolean;
  open_to_crew: boolean;
}

export interface VenueProfile extends ProfileBase {
  kind: "venue";
  type: string;
  address: string;
  equipment: string;
  foodDrinks: string;

  music: string[];
  image: string | null;
  image_url: string | null;
  music_styles: string[];
  food_drinks: string;
}

export type Profile = DjProfile | VenueProfile;

export interface GigProfileLink {
  profileId: string;
  profileKind: ProfileKind;
  displayName: string;
  city: CityValue | string;
  styles: string[];
}

export function toGigProfileLink(profile: Profile): GigProfileLink {
  return {
    profileId: profile.id,
    profileKind: profile.kind,
    displayName: profile.name,
    city: profile.city,
    styles: profile.styles,
  };
}

export function getProfileAvatar(profile: ProfileBase): string | null {
  return profile.avatar || null;
}

export function getProfileStyles(profile: ProfileBase): string[] {
  return profile.styles ?? [];
}
