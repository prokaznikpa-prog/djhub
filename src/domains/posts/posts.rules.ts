import type { GigStatus, GigType } from "@/lib/gigs";

export type VenuePostModerationStatus = "active" | "hidden" | "archived" | "blocked";

export type VenuePostFilters = {
  city?: string;
  style?: string;
  status?: GigStatus;
  postType?: GigType;
  venueId?: string;
};

export type VenuePostVisibilityInput = {
  moderation_status?: string | null;
} | null | undefined;

export type VenuePostFilterInput = {
  city: string;
  status: GigStatus | string;
  post_type: GigType | string;
  venue_id: string;
  music_styles: string[];
  moderation_status?: string | null;
};

export function normalizePostModerationStatus(status: string | null | undefined): VenuePostModerationStatus {
  return ["hidden", "archived", "blocked"].includes(status ?? "") ? status as VenuePostModerationStatus : "active";
}

export function getPostVisibility(post: VenuePostVisibilityInput) {
  const moderationStatus = normalizePostModerationStatus(post?.moderation_status);
  return {
    moderationStatus,
    publicVisible: moderationStatus === "active",
    hiddenFromPublic: moderationStatus !== "active",
    readOnly: moderationStatus === "archived" || moderationStatus === "blocked",
  };
}

export function canInteractWithPost(post: VenuePostVisibilityInput) {
  const { moderationStatus } = getPostVisibility(post);
  if (moderationStatus === "hidden") return { allowed: false, reason: "Публикация скрыта модератором" };
  if (moderationStatus === "archived") return { allowed: false, reason: "Публикация находится в архиве" };
  if (moderationStatus === "blocked") return { allowed: false, reason: "Публикация заблокирована модератором" };
  return { allowed: true, reason: null };
}

export function parseVenuePostsFiltersKey(key: string): VenuePostFilters | null {
  if (!key.startsWith("venue-posts:")) return null;
  try {
    return JSON.parse(key.slice("venue-posts:".length)) as VenuePostFilters;
  } catch {
    return null;
  }
}

export function postMatchesVenuePostsFilters(post: VenuePostFilterInput, filters: VenuePostFilters | null) {
  if (!filters) return false;
  if (filters.city && post.city !== filters.city) return false;
  if (filters.status && post.status !== filters.status) return false;
  if (filters.postType && post.post_type !== filters.postType) return false;
  if (filters.venueId && post.venue_id !== filters.venueId) return false;
  if (!filters.venueId && !getPostVisibility(post).publicVisible) return false;
  if (filters.style && !post.music_styles.includes(filters.style)) return false;
  return true;
}
