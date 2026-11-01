"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { saveLanguage, textFor, type Language, type Messages } from "@/shared/i18n/language";

type LanguageState = {
  language: Language;
  /** False until the chef picks a language on this device: sign-in and the application ask first. */
  chosen: boolean;
  setLanguage(next: Language): void;
};

// Without a provider (customer pages, unit tests) everything reads English.
const LanguageContext = createContext<LanguageState>({ language: "en", chosen: true, setLanguage: () => {} });

export function LanguageProvider({ initial, chosen: initiallyChosen, children }: { initial: Language; chosen: boolean; children?: ReactNode }) {
  const router = useRouter();
  const [language, setCurrent] = useState(initial);
  const [chosen, setChosen] = useState(initiallyChosen);
  const setLanguage = useCallback(
    (next: Language) => {
      saveLanguage(next);
      setCurrent(next);
      setChosen(true);
      // Titles and the page's lang attribute are drawn on the server from the cookie.
      router.refresh();
    },
    [router],
  );
  const value = useMemo(() => ({ language, chosen, setLanguage }), [language, chosen, setLanguage]);
  return <LanguageContext value={value}>{children}</LanguageContext>;
}

export function useLanguage(): LanguageState {
  return useContext(LanguageContext);
}

/** This screen's words in the chef's language. */
export function useText<T extends Record<string, string>>(text: Messages<T>): T {
  return textFor(text, useContext(LanguageContext).language);
}
