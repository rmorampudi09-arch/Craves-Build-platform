import AsyncStorage from '@react-native-async-storage/async-storage';
import {useSyncExternalStore} from 'react';
import {StyleSheet} from 'react-native';

export {borderWidth, iconSize, radius, spacing, textDefaults, touchTarget} from '../../design/tokens';

/**
 * The rider app's own look (redesign R1, Nov 2026; DESIGN.md). Day is the default; Night is the rider's choice in
 * Profile. The customer and chef apps keep design/tokens.ts: nothing here changes them.
 *
 * Kitchen and customer have their own panels so a glance tells the phase: peach for the kitchen, mint for the
 * customer by day; dark brown and deep green by night, with white text.
 */
const day = {
  flameRed: '#F62E18', // the one primary action, the countdown, the active tab mark; labels on it are white bold 19+
  flameRedAccessible: '#D92714', // pressed primary
  redText: '#C4230F', // red text links and the active tab label (flame red is 3.9:1 on white, too light for text)
  textPrimary: '#261A15',
  textSecondary: '#5E524C',
  placeholder: '#7D7570',
  border: '#E3DDD8',
  borderStrong: '#CDC4BE',
  white: '#FFFFFF', // text and drawings on red; never a surface (that is `surface`)
  onWhite: '#261A15', // the dark mark on something white in both themes (the slide's knob)
  ground: '#F2EFEC', // behind the cards
  surface: '#FFFFFF',
  muted: '#F7F4F1',
  surfaceMuted: '#F7F4F1',
  cream: '#FFF5E9',
  inverse: '#261A15', // selected chip, ticked box, the trip-in-progress strip
  onInverse: '#FFFFFF',
  success: '#1E8A5E',
  onSuccess: '#FFFFFF',
  successText: '#166B49',
  successSoft: '#E2F3EA',
  warningText: '#7A4A00',
  warningSoft: '#FFF0D2',
  error: '#C72C21',
  errorSoft: '#FDEAE8',
  infoText: '#1F4FAF',
  infoSoft: '#EAF0FF',
  kitchen: '#FFE4CC',
  kitchenInk: '#261A15',
  kitchenSub: '#7A3A10',
  kitchenMark: '#C2510C',
  tile: '#FFFFFF',
  drop: '#D8F1E5',
  dropInk: '#261A15',
  dropSub: '#0B5A40',
  dropMark: '#0B6B4D',
  camera: '#DCD5CF',
  doneHead: '#0B6B4D', // Trip complete's header, the same in both themes, white words on it
  sos: '#C72C21', // the SOS screen's ground, the same in both themes
  onDoneHeadSoft: '#D8F1E5',
};

export type RiderPalette = typeof day;

const night: RiderPalette = {
  flameRed: '#F62E18',
  flameRedAccessible: '#D92714',
  redText: '#FF7B66',
  textPrimary: '#F6F1EE',
  textSecondary: '#BDB2AB',
  placeholder: '#9C918A',
  border: '#2E2926',
  borderStrong: '#4A423E',
  white: '#FFFFFF',
  onWhite: '#261A15',
  ground: '#0F0D0C',
  surface: '#1A1716',
  muted: '#221E1C',
  surfaceMuted: '#221E1C',
  cream: '#3A2B23',
  inverse: '#F6F1EE',
  onInverse: '#0F0D0C',
  success: '#66D7A6',
  onSuccess: '#0F0D0C',
  successText: '#66D7A6',
  successSoft: '#10271D',
  warningText: '#F7C873',
  warningSoft: '#2A2010',
  error: '#E3392C',
  errorSoft: '#3A1714',
  infoText: '#A9C1FF',
  infoSoft: '#16213D',
  kitchen: '#3A2B23',
  kitchenInk: '#FFFFFF',
  kitchenSub: '#D9CBC3',
  kitchenMark: '#F59A5C',
  tile: 'rgba(255,255,255,0.1)',
  drop: '#0A5C43',
  dropInk: '#FFFFFF',
  dropSub: '#BFE6D6',
  dropMark: '#66D7A6',
  camera: '#2A2523',
  doneHead: '#0B6B4D',
  sos: '#C72C21',
  onDoneHeadSoft: '#D8F1E5',
};

/** Barlow for reading, Barlow Condensed for the few numbers read from arm's length. One family per weight, so
 * Android never fakes a bold; Telugu, Hindi and Kannada glyphs fall back to the phone's Noto fonts. */
export const font = {
  regular: 'Barlow-Regular',
  semibold: 'Barlow-SemiBold',
  bold: 'Barlow-Bold',
  display: 'BarlowCondensed-ExtraBold',
  displayBold: 'BarlowCondensed-Bold',
} as const;

const dayType = {
  pay: 84, // the offer's pay, once per app
  code: 56, // the order code on the kitchen board
  money: 48, // money heroes: today, you earned, withdrawable
  title: 32,
  hero: 26,
  headerTitle: 22,
  heading: 20,
  button: 19, // white on flame red passes as large text only from 19 bold
  body: 16,
  small: 14,
  tiny: 13,
};

// Night riders read in the dark: nothing smaller than 15.
const nightType: typeof dayType = {...dayType, small: 15, tiny: 15};

export type RiderThemeName = 'day' | 'night';
const palettes: Record<RiderThemeName, RiderPalette> = {day, night};
const types: Record<RiderThemeName, typeof dayType> = {day: dayType, night: nightType};

let current: RiderThemeName = 'day';
const listeners = new Set<() => void>();

/** Live colours: read them while rendering, never at module scope, so a theme switch reaches every screen. */
export const colors: RiderPalette = {...day};
export const typography = {...dayType};

export const riderTheme = (): RiderThemeName => current;

export function setRiderTheme(name: RiderThemeName) {
  if (name === current) {
    return;
  }
  current = name;
  Object.assign(colors, palettes[name]);
  Object.assign(typography, types[name]);
  listeners.forEach(listener => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Re-renders the caller when the rider switches Day/Night (useStrings calls it, so every rider screen does). */
export const useRiderTheme = () => useSyncExternalStore(subscribe, riderTheme, riderTheme);

/** StyleSheet.create, once per theme: each `styles.x` read returns the current theme's style. */
export function themedStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  make: (c: RiderPalette) => T & StyleSheet.NamedStyles<any>,
): T {
  const sheets: Partial<Record<RiderThemeName, T>> = {};
  const sheet = () => (sheets[current] ??= StyleSheet.create(make(palettes[current])));
  return new Proxy({} as T, {get: (_target, key) => sheet()[key as keyof T]});
}

const THEME_KEY = 'craves.rider.theme';

/** The rider's last choice; the splash covers the read. */
export async function loadRiderTheme() {
  try {
    const saved = await AsyncStorage.getItem(THEME_KEY);
    if (saved === 'day' || saved === 'night') {
      setRiderTheme(saved);
    }
  } catch {
    // Day it is.
  }
}

export function chooseRiderTheme(name: RiderThemeName) {
  setRiderTheme(name);
  AsyncStorage.setItem(THEME_KEY, name).catch(() => undefined);
}
