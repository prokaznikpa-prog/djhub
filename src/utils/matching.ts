type MatchProfile = {
  city?: string | null;
  styles?: string[] | null;
  music_styles?: string[] | null;
  priorityStyle?: string | null;
  priority_style?: string | null;
  price?: string | null;
  format?: string | null;
  availability?: string | null;
  playedAt?: string[] | null;
  played_at?: string[] | null;
  experience?: string | null;
  budget?: string | null;
  expectedBudget?: string | null;
  expected_budget?: string | null;
};

type MatchGig = {
  city?: string | null;
  music_styles?: string[] | null;
  style?: string | null;
  budget?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  format?: string | null;
  duration?: string | null;
  schedule?: string | null;
  frequency?: string | null;
};

const REGION_GROUPS = [
  new Set(["saint-petersburg", "leningrad-oblast"]),
];

const WEIGHTS = {
  style: 8,
  city: 7,
  budget: 9,
  recency: 5,
  experience: 3,
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function normalizeText(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function normalizeList(values?: (string | null | undefined)[] | null) {
  return [...new Set((values ?? []).map(normalizeText).filter(Boolean))];
}

function countOverlap(left?: (string | null | undefined)[] | null, right?: (string | null | undefined)[] | null) {
  const rightSet = new Set(normalizeList(right));
  return normalizeList(left).filter((item) => rightSet.has(item)).length;
}

function parseMoney(value?: string | number | null) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const digits = (value ?? "").replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

function areSameRegion(left?: string | null, right?: string | null) {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (!a || !b || a === b) return false;
  return REGION_GROUPS.some((group) => group.has(a) && group.has(b));
}

function getStyleScore(
  itemStyles?: (string | null | undefined)[] | null,
  profileStyles?: (string | null | undefined)[] | null,
  priorityStyle?: string | null,
) {
  const item = normalizeList(itemStyles);
  const profile = normalizeList(profileStyles);
  if (item.length === 0 || profile.length === 0) return 0;

  const overlap = countOverlap(item, profile);
  const baseScore = overlap / Math.min(item.length, profile.length);
  const priorityBonus = priorityStyle && item.includes(normalizeText(priorityStyle)) ? 0.2 : 0;

  return clamp01(baseScore + priorityBonus);
}

function getRecencyScore(dateValue?: string | null) {
  if (!dateValue) return 0;
  const created = new Date(dateValue).getTime();
  if (!Number.isFinite(created)) return 0;
  const ageDays = Math.max(0, (Date.now() - created) / 86_400_000);
  return clamp01(1 - Math.min(ageDays, 30) / 30);
}

function getCityScore(itemCity?: string | null, profileCity?: string | null) {
  if (!itemCity || !profileCity) return 0;
  if (normalizeText(itemCity) === normalizeText(profileCity)) return 1;
  if (areSameRegion(itemCity, profileCity)) return 0.65;
  return 0;
}

function getBudgetScore(budgetValue?: string | null, priceValue?: string | null) {
  const budget = parseMoney(budgetValue);
  const price = parseMoney(priceValue);
  if (!budget || !price) return 0;
  if (budget >= price) return 1;

  const ratio = budget / price;
  return clamp01(Math.pow(ratio, 4));
}

function hasStyleOverlap(left?: (string | null | undefined)[] | null, right?: (string | null | undefined)[] | null) {
  return countOverlap(left, right) > 0;
}

function isExactCityMatch(itemCity?: string | null, profileCity?: string | null) {
  return !!itemCity && !!profileCity && normalizeText(itemCity) === normalizeText(profileCity);
}

function isNearbyCityMatch(itemCity?: string | null, profileCity?: string | null) {
  return isExactCityMatch(itemCity, profileCity) || areSameRegion(itemCity, profileCity);
}

function isBudgetFit(budgetValue?: string | null, priceValue?: string | null) {
  const budget = parseMoney(budgetValue);
  const price = parseMoney(priceValue);
  return !!budget && !!price && budget >= price;
}

function getExperienceScore(dj: MatchProfile) {
  const playedAtCount = (dj.played_at ?? dj.playedAt ?? []).filter(Boolean).length;
  const playedAtScore = Math.min(playedAtCount, 6) / 6;

  const experience = normalizeText(dj.experience);
  let experienceScore = 0;
  if (experience) {
    experienceScore = /\d/.test(experience) ? Math.min(parseMoney(experience), 10) / 10 : 0.35;
  }

  return clamp01(playedAtScore * 0.7 + experienceScore * 0.3);
}

export function calculateGigScore(gig: MatchGig, djProfile?: MatchProfile | null) {
  if (!djProfile) return getRecencyScore(gig.created_at ?? gig.updated_at) * WEIGHTS.recency;

  const gigStyles = gig.music_styles?.length ? gig.music_styles : gig.style ? [gig.style] : [];
  const djStyles = [
    djProfile.priority_style ?? djProfile.priorityStyle ?? "",
    ...(djProfile.styles ?? []),
  ];

  return (
    getStyleScore(gigStyles, djStyles, djProfile.priority_style ?? djProfile.priorityStyle) * WEIGHTS.style +
    getCityScore(gig.city, djProfile.city) * WEIGHTS.city +
    getBudgetScore(gig.budget, djProfile.price) * WEIGHTS.budget +
    getRecencyScore(gig.created_at ?? gig.updated_at) * WEIGHTS.recency
  );
}

export function calculateDjScore(dj: MatchProfile, venueProfile?: MatchProfile | null) {
  if (!venueProfile) return getExperienceScore(dj) * WEIGHTS.experience;

  const venueStyles = venueProfile.music_styles?.length ? venueProfile.music_styles : venueProfile.styles;
  const expectedBudget = venueProfile.expected_budget ?? venueProfile.expectedBudget ?? venueProfile.budget;

  return (
    getStyleScore(dj.styles, venueStyles, dj.priority_style ?? dj.priorityStyle) * WEIGHTS.style +
    getCityScore(dj.city, venueProfile.city) * WEIGHTS.city +
    getBudgetScore(expectedBudget, dj.price) * WEIGHTS.budget +
    getExperienceScore(dj) * WEIGHTS.experience
  );
}

export function getGigMatchReasons(gig: MatchGig, djProfile?: MatchProfile | null) {
  if (!djProfile) return [];

  const reasons: string[] = [];
  const gigStyles = gig.music_styles?.length ? gig.music_styles : gig.style ? [gig.style] : [];
  const djStyles = [
    djProfile.priority_style ?? djProfile.priorityStyle ?? "",
    ...(djProfile.styles ?? []),
  ];

  if (hasStyleOverlap(gigStyles, djStyles)) reasons.push("Подходит по стилю");
  if (isBudgetFit(gig.budget, djProfile.price)) reasons.push("Хорошая цена");
  if (isNearbyCityMatch(gig.city, djProfile.city)) reasons.push("Рядом с вами");

  return reasons.slice(0, 2);
}

export function getDjMatchReasons(dj: MatchProfile, venueProfile?: MatchProfile | null) {
  if (!venueProfile) return [];

  const reasons: string[] = [];
  const venueStyles = venueProfile.music_styles?.length ? venueProfile.music_styles : venueProfile.styles;
  const expectedBudget = venueProfile.expected_budget ?? venueProfile.expectedBudget ?? venueProfile.budget;

  if (hasStyleOverlap(dj.styles, venueStyles)) reasons.push("Подходит по стилю");
  if (isExactCityMatch(dj.city, venueProfile.city)) reasons.push("Тот же город");
  if (isBudgetFit(expectedBudget, dj.price)) reasons.push("Подходит по бюджету");

  return reasons.slice(0, 2);
}

export function getMatchReasons(item: MatchGig | MatchProfile, profile?: MatchProfile | null) {
  return "music_styles" in item || "style" in item
    ? getGigMatchReasons(item as MatchGig, profile)
    : getDjMatchReasons(item as MatchProfile, profile);
}
