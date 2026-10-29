import React, {createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import {NativeModules} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {Language} from '../api/contract';
import {isDemo} from '../riderConfig';
import {en, type RiderStrings} from './en';
import {hi} from './hi';
import {te} from './te';

const STORAGE_KEY = 'rider.language';
const BY_LANGUAGE: Record<Language, RiderStrings> = {en, te, hi};

/**
 * Translations a native speaker has signed off (WORKPLAN P2-08; the lawyer signs off the terms words too). Riders see
 * only these and English; demo builds show every language, so the reviewer reads each screen in place. Add 'te' or 'hi'
 * here only with that sign-off.
 */
export const REVIEWED_LANGUAGES: readonly Language[] = [];

/** The languages a build offers, English first. */
export const languagesFor = (demo: boolean, reviewed: readonly Language[]): Language[] =>
  (['en', 'te', 'hi'] as const).filter(code => code === 'en' || demo || reviewed.includes(code));

/** What riders can pick in this build; with English alone the pickers hide. */
export const RIDER_LANGUAGES = languagesFor(isDemo, REVIEWED_LANGUAGES);

interface StringsContextValue {
  strings: RiderStrings;
  /** The language on screen: the rider's pick when this build offers it, otherwise English (the pick stays saved). */
  language: Language;
  setLanguage(language: Language): void;
  /** Uses the server's language only until the rider picks one. */
  adoptServerLanguage(language: Language): void;
}

const StringsContext = createContext<StringsContextValue>({
  strings: en,
  language: 'en',
  setLanguage: () => undefined,
  adoptServerLanguage: () => undefined,
});

export function RiderStringsProvider({children}: PropsWithChildren) {
  const [language, setLanguageState] = useState<Language>('en');
  const [chosen, setChosen] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(saved => {
        if (saved === 'en' || saved === 'te' || saved === 'hi') {
          setLanguageState(saved);
          setChosen(true);
        }
      })
      .catch(() => undefined);
  }, []);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    setChosen(true);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  }, []);

  const adoptServerLanguage = useCallback(
    (next: Language) => {
      if (!chosen) {
        setLanguageState(next);
      }
    },
    [chosen],
  );

  const shown = RIDER_LANGUAGES.includes(language) ? language : 'en';
  useEffect(() => {
    // Notifications and the online service's messages follow the app (RiderText.kt); the module exists only in the rider build.
    NativeModules.CravesRiderOnline?.setLanguage?.(shown);
  }, [shown]);

  const value = useMemo(
    () => ({strings: BY_LANGUAGE[shown], language: shown, setLanguage, adoptServerLanguage}),
    [shown, setLanguage, adoptServerLanguage],
  );
  return <StringsContext.Provider value={value}>{children}</StringsContext.Provider>;
}

export const useStrings = () => useContext(StringsContext);
