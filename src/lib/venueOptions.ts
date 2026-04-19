export const VENUE_TYPE_OPTIONS = [
    { value: "", label: "Выбрать" },
  { value: "bar", label: "Бар" },
  { value: "club", label: "Клуб" },
  { value: "restaurant", label: "Ресторан" },
  { value: "lounge", label: "Лаунж" },
  { value: "karaoke", label: "Караоке" },
  { value: "hotel", label: "Отель" },
  { value: "event-space", label: "Ивент-площадка" },
] as const;

export const VENUE_EQUIPMENT_OPTIONS = [
    { value: "", label: "Выбрать" },
  { value: "cdj-2000nxs2", label: "CDJ-2000NXS2" },
  { value: "cdj-3000", label: "CDJ-3000" },
  { value: "xdj-1000mk2", label: "XDJ-1000MK2" },
  { value: "xdj-xz", label: "XDJ-XZ" },
  { value: "controller", label: "Контроллер" },
  { value: "cdj-900", label: "CDJ-900" },
  { value: "cdj-900nexus", label: "CDJ-900 Nexus" },
  { value: "other", label: "другое" },
] as const;

export const VENUE_CONDITIONS_OPTIONS = [
    { value: "", label: "Выбрать" },
  { value: "drinks-food", label: "Напитки и еда" },
  { value: "rider", label: "Райдер" },
  { value: "drinks", label: "Напитки" },
  { value: "none", label: "Не предусмотрено" },
] as const;

export type VenueTypeValue =
  (typeof VENUE_TYPE_OPTIONS)[number]["value"];

export type VenueEquipmentValue =
  (typeof VENUE_EQUIPMENT_OPTIONS)[number]["value"];

export type VenueConditionsValue =
  (typeof VENUE_CONDITIONS_OPTIONS)[number]["value"];

export function getVenueOptionLabel(
  value: string | null | undefined,
  options: readonly { value: string; label: string }[]
): string {
  if (!value) return "";
  return options.find((item) => item.value === value)?.label ?? value;
}