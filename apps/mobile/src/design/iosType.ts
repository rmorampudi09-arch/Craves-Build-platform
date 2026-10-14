import {StyleSheet} from 'react-native';
import {useFonts} from 'expo-font';
import {loginFontAssets, loginFonts} from '../features/auth/components/loginVisuals';

/**
 * iPhone text styles set in Outfit, the app font. Sizes and line heights are Apple's Dynamic
 * Type defaults (this phone's 393dp width matches an iPhone 15's 393pt); titles of 20 and up
 * are 2% tighter, as in the font demo. Each style names its weight's font file: never add
 * fontWeight on top, Android would fake-bold it.
 */
export const iosType = StyleSheet.create({
  largeTitle: {fontFamily: loginFonts.bold, fontSize: 34, lineHeight: 41, letterSpacing: -0.68},
  title1: {fontFamily: loginFonts.bold, fontSize: 28, lineHeight: 34, letterSpacing: -0.56},
  title2: {fontFamily: loginFonts.bold, fontSize: 22, lineHeight: 28, letterSpacing: -0.44},
  title3: {fontFamily: loginFonts.semibold, fontSize: 20, lineHeight: 25, letterSpacing: -0.4},
  headline: {fontFamily: loginFonts.semibold, fontSize: 17, lineHeight: 22, letterSpacing: 0},
  body: {fontFamily: loginFonts.regular, fontSize: 17, lineHeight: 22, letterSpacing: 0},
  callout: {fontFamily: loginFonts.regular, fontSize: 16, lineHeight: 21, letterSpacing: 0},
  subheadline: {fontFamily: loginFonts.regular, fontSize: 15, lineHeight: 20, letterSpacing: 0},
  footnote: {fontFamily: loginFonts.regular, fontSize: 13, lineHeight: 18, letterSpacing: 0},
  caption1: {fontFamily: loginFonts.regular, fontSize: 12, lineHeight: 16, letterSpacing: 0},
  caption2: {fontFamily: loginFonts.regular, fontSize: 11, lineHeight: 13, letterSpacing: 0},
});

/** Weight swaps for an iosType style, e.g. [iosType.subheadline, iosWeight.semibold]. */
export const iosWeight = StyleSheet.create({
  regular: {fontFamily: loginFonts.regular},
  semibold: {fontFamily: loginFonts.semibold},
  bold: {fontFamily: loginFonts.bold},
});

/**
 * Signed-in launches skip the auth stack that normally loads these font files. Render iosType text only once
 * this is true: Android keeps the fallback face on text drawn before the font registered.
 */
export function useIosFonts(): boolean {
  const [loaded, error] = useFonts(loginFontAssets);
  return loaded || Boolean(error);
}
