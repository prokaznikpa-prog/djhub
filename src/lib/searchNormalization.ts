const SEARCH_ALIASES: Record<string, string[]> = {
  "saint-petersburg": ["Санкт-Петербург", "Петербург", "СПб", "Saint Petersburg", "St Petersburg"],
  "saint petersburg": ["Санкт-Петербург", "Петербург", "СПб"],
  "st petersburg": ["Санкт-Петербург", "Петербург", "СПб"],
  "ленинградская область": ["leningrad-oblast", "Leningrad oblast", "Ленобласть"],
  "leningrad-oblast": ["Ленинградская область", "Ленобласть", "Leningrad oblast"],
  techno: ["техно"],
  house: ["хаус"],
  "deep house": ["дип хаус", "deep-house"],
  "tech house": ["тек хаус", "tech-house"],
  minimal: ["минимал"],
  dnb: ["драм-н-бейс", "драм энд бейс", "drum and bass"],
  "hip-hop": ["хип-хоп", "хип хоп", "hip hop"],
  trap: ["трэп", "трап"],
  "r&b": ["rnb", "рнб", "ар-н-би"],
  "witch house": ["витч хаус", "witch-house"],
  ambient: ["эмбиент"],
  downtempo: ["даунтемпо"],
  disco: ["диско"],
  funk: ["фанк"],
  pop: ["поп"],
};

export const normalizeSearchText = (value: string | null | undefined): string =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");

export const buildSearchableText = (values: Array<string | null | undefined>): string => {
  const parts = new Set<string>();

  values.forEach((value) => {
    const normalized = normalizeSearchText(value);
    if (!normalized) return;

    parts.add(value ?? "");
    parts.add(normalized);

    const aliases = SEARCH_ALIASES[normalized] ?? SEARCH_ALIASES[normalized.replace(/\s+/g, "-")] ?? [];
    aliases.forEach((alias) => parts.add(alias));
  });

  return normalizeSearchText(Array.from(parts).join(" "));
};

export const matchesSearch = (query: string, values: Array<string | null | undefined>): boolean => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  return buildSearchableText(values).includes(normalizedQuery);
};
