import React, {createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import {NativeModules} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {Language} from '../api/contract';
import {isDemo} from '../riderConfig';
import {en, type RiderStrings} from './en';
import {hi} from './hi';
import {kn} from './kn';
import {te} from './te';

/**
 * The app's languages: the server's three, and Kannada. The server keeps en, te or hi for each rider (its messages,
 * the terms' summary); a rider reading Kannada is kept in English there (serverLanguage).
 */
export type AppLanguage = Language | 'kn';
const APP_LANGUAGES = ['en', 'te', 'hi', 'kn'] as const;

const STORAGE_KEY = 'rider.language';
const BY_LANGUAGE: Record<AppLanguage, RiderStrings> = {en, te, hi, kn};

/** The language the server stores and answers in for a rider reading `language`. */
export const serverLanguage = (language: AppLanguage): Language => (language === 'kn' ? 'en' : language);

/**
 * Translations a native speaker has signed off (WORKPLAN P2-08; the lawyer signs off the terms words too). Riders see
 * only these and English; demo builds show every language, so the reviewer reads each screen in place. Add 'te', 'hi'
 * or 'kn' here only with that sign-off.
 */
export const REVIEWED_LANGUAGES: readonly AppLanguage[] = [];

/** The languages a build offers, English first. */
export const languagesFor = (demo: boolean, reviewed: readonly AppLanguage[]): AppLanguage[] =>
  APP_LANGUAGES.filter(code => code === 'en' || demo || reviewed.includes(code));

/** What riders can pick in this build; with English alone the pickers hide. */
export const RIDER_LANGUAGES = languagesFor(isDemo, REVIEWED_LANGUAGES);

interface StringsContextValue {
  strings: RiderStrings;
  /** The language on screen: the rider's pick when this build offers it, otherwise English (the pick stays saved). */
  language: AppLanguage;
  setLanguage(language: AppLanguage): void;
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
  const [language, setLanguageState] = useState<AppLanguage>('en');
  const [chosen, setChosen] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(saved => {
        const known = APP_LANGUAGES.find(code => code === saved);
        if (known) {
          setLanguageState(known);
          setChosen(true);
        }
      })
      .catch(() => undefined);
  }, []);

  const setLanguage = useCallback((next: AppLanguage) => {
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
