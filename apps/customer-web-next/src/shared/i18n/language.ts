/**
 * The chef side speaks the chef's language: English, Telugu (Hyderabad) or Kannada (Bengaluru).
 * The choice is a cookie, so the server draws the first screen in it and nothing flashes in English.
 * Customer pages have no language provider and stay English.
 */
export const LANGUAGES = ["en", "te", "kn"] as const;
export type Language = (typeof LANGUAGES)[number];

export const LANGUAGE_COOKIE = "craves_lang";
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/** Each language in its own script, with its English name for anyone helping the chef. */
export const LANGUAGE_NAMES: Record<Language, { native: string; english: string; locale: string }> = {
  en: { native: "English", english: "English", locale: "en-IN" },
  te: { native: "తెలుగు", english: "Telugu", locale: "te-IN" },
  kn: { native: "ಕನ್ನಡ", english: "Kannada", locale: "kn-IN" },
};

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
}

/** The saved choice from a cookie value, or null when none was made. */
export function parseLanguage(value: string | null | undefined): Language | null {
  return isLanguage(value) ? value : null;
}

/** The language saved on this device, read from document.cookie; null on the server or before a choice. */
export function savedLanguage(): Language | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${LANGUAGE_COOKIE}=([^;]+)`));
  return parseLanguage(match?.[1]);
}

export function saveLanguage(language: Language): void {
  document.cookie = `${LANGUAGE_COOKIE}=${language}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
}

/** Every language says the same things: TypeScript keeps the keys equal, a test keeps none empty. */
export type Messages<T extends Record<string, string>> = { en: T; te: Record<keyof T, string>; kn: Record<keyof T, string> };

export function messages<T extends Record<string, string>>(text: Messages<T>): Messages<T> {
  return text;
}

export function textFor<T extends Record<string, string>>(text: Messages<T>, language: Language): T {
  return text[language] as T;
}

/** "{count} dishes" with { count: 3 } -> "3 dishes". A missing value stays visible as {name}, so a test can catch it. */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole));
}
