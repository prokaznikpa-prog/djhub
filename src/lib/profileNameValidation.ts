const CONTACT_PATTERN =
  /(https?:\/\/|www\.|(?:^|\s)[\w-]+\.(?:ru|com|net|org)\b|@\w{2,}|telegram|телеграм|tg\b|whatsapp|ватсап|instagram|инстаграм|\+?\d[\d\s().-]{5,}\d)/iu;

const PROFANITY_PATTERN =
  /\b(хуй|хуе|хуё|пизд|еба|ёба|ебл|бля|бляд|сук|муд(а|о)к|гандон|уеб|нахуй|fuck|fck|bitch|whore|slut|cunt|dick|cock|pussy|asshole|motherfucker)\b/iu;

const LETTER_OR_DIGIT_PATTERN = /[\p{L}\p{N}]/gu;

export function validateProfileName(rawValue: string): string | null {
  const value = rawValue.trim();

  if (!value) {
    return "Имя слишком короткое";
  }

  if (value.length < 2) {
    return "Имя слишком короткое";
  }

  if (value.length > 30) {
    return "Имя слишком длинное";
  }

  if (CONTACT_PATTERN.test(value)) {
    return "В имени нельзя использовать ссылки, контакты или телефоны";
  }

  if (PROFANITY_PATTERN.test(value.toLowerCase())) {
    return "Имя содержит запрещённые слова";
  }

  const meaningfulCharacters = value.match(LETTER_OR_DIGIT_PATTERN) ?? [];
  if (meaningfulCharacters.length < 2 || meaningfulCharacters.length / value.length < 0.5) {
    return "Имя содержит запрещённые слова";
  }

  return null;
}

export function validateDjPrice(rawValue: string): string | null {
  const value = rawValue.trim();
  const parsed = Number(value);

  if (value.length === 0 || Number.isNaN(parsed) || !Number.isFinite(parsed) || parsed < 0 || parsed > 50000) {
    return "Цена должна быть от 0 до 50000 ₽/час";
  }

  return null;
}
