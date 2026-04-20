const INVALID_DISPLAY_VALUES = new Set(["test", "demo", "mock", "placeholder"]);

export function isInvalidDisplayValue(value: string | null | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return !normalized || INVALID_DISPLAY_VALUES.has(normalized);
}

export function getCleanDisplayLabel(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed || isInvalidDisplayValue(trimmed)) return "";

  const looksLikeRawSlug = /^[a-z0-9]+(?:-[a-z0-9]+)+$/i.test(trimmed);
  if (looksLikeRawSlug) return "";

  return trimmed;
}

export function getCleanDisplayOptions(
  values: Array<string | null | undefined>,
  getLabel: (value: string) => string
): string[] {
  const seen = new Set<string>();

  values.forEach((value) => {
    const trimmed = value?.trim();
    if (!trimmed || isInvalidDisplayValue(trimmed)) return;
    if (!getLabel(trimmed)) return;
    seen.add(trimmed);
  });

  return Array.from(seen).sort((a, b) =>
    getLabel(a).localeCompare(getLabel(b), "ru", { sensitivity: "base" })
  );
}
