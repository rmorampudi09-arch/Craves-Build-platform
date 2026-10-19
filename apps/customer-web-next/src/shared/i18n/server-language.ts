import { cookies } from "next/headers";
import { LANGUAGE_COOKIE, parseLanguage, type Language } from "@/shared/i18n/language";

/** The chef's saved language for this request, or null before they choose one. Server components only. */
export async function requestLanguage(): Promise<Language | null> {
  return parseLanguage((await cookies()).get(LANGUAGE_COOKIE)?.value);
}
