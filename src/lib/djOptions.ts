export const DJ_AVAILABILITY_OPTIONS = [
 { value: "", label: "Выбрать" },
  { value: "weekdays", label: "Будни" },
  { value: "weekends", label: "Выходные" },
  { value: "any-day", label: "Любые дни" },
  { value: "by-agreement", label: "По договорённости" },
] as const;

export function getDjAvailabilityLabel(value: string | null | undefined): string {
  if (!value) return "";
  const option = DJ_AVAILABILITY_OPTIONS.find((item) => item.value === value);
  return option?.label ?? value;
}
export const DJ_EXPERIENCE_OPTIONS = [
    { value: "", label: "Выбрать" },
  { value: "no-experience", label: "Нет опыта" },
  { value: "up-to-6-months", label: "До 6 месяцев" },
  { value: "6-to-12-months", label: "6–12 месяцев" },
  { value: "1-to-2-years", label: "1–2 года" },
  { value: "2-plus-years", label: "Более 2 лет" },
] as const;

export function getDjExperienceLabel(exp: string | null): string {
  if (!exp) return "";
  const option = DJ_EXPERIENCE_OPTIONS.find((item) => item.value === exp);
  return option?.label ?? exp;
}