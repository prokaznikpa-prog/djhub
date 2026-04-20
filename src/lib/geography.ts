import { getCleanDisplayLabel } from "@/lib/displayLabels";

export const CITY_OPTIONS = [
  { value: "saint-petersburg", label: "Санкт-Петербург" },
  { value: "leningrad-oblast", label: "Ленинградская область" },
] as const;

export type CityValue = (typeof CITY_OPTIONS)[number]["value"];

export function getCityLabel(city?: string | null): string {
  if (!city) return "";
  const option = CITY_OPTIONS.find((item) => item.value === city);
  return option?.label ?? getCleanDisplayLabel(city);
}
