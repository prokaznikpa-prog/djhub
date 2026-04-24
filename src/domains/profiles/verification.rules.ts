type ProfileLike = Record<string, unknown> | null | undefined;

const hasText = (value: unknown): boolean => typeof value === "string" && value.trim().length > 0;
const hasItems = (value: unknown): boolean => Array.isArray(value) && value.some((item) => hasText(item));

export function isDjProfileComplete(profile: ProfileLike): boolean {
  if (!profile) return false;

  return (
    hasText(profile.name) &&
    hasText(profile.city) &&
    hasText(profile.image_url ?? profile.image ?? profile.avatar) &&
    hasText(profile.bio ?? profile.description) &&
    (hasItems(profile.styles) || hasText(profile.priority_style ?? profile.priorityStyle)) &&
    hasText(profile.price)
  );
}

export function isVenueProfileComplete(profile: ProfileLike): boolean {
  if (!profile) return false;

  return (
    hasText(profile.name) &&
    hasText(profile.city) &&
    hasText(profile.image_url ?? profile.image ?? profile.avatar) &&
    hasText(profile.description) &&
    hasText(profile.type) &&
    hasText(profile.address) &&
    hasItems(profile.music_styles ?? profile.music ?? profile.styles)
  );
}
