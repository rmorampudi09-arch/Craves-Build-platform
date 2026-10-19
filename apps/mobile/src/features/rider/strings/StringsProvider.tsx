import React, {createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {Language} from '../api/contract';
import {en, type RiderStrings} from './en';
import {hi} from './hi';
import {te} from './te';

const STORAGE_KEY = 'rider.language';
const BY_LANGUAGE: Record<Language, RiderStrings> = {en, te, hi};

interface StringsContextValue {
  strings: RiderStrings;
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

  const value = useMemo(
    () => ({strings: BY_LANGUAGE[language], language, setLanguage, adoptServerLanguage}),
    [language, setLanguage, adoptServerLanguage],
  );
  return <StringsContext.Provider value={value}>{children}</StringsContext.Provider>;
}

export const useStrings = () => useContext(StringsContext);
