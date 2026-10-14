import {StyleSheet} from 'react-native';
import {useFonts} from 'expo-font';
import {loginFontAssets, loginFonts} from '../features/auth/components/loginVisuals';

/**
 * iPhone (SF Pro) text styles, set in Inter: Apple licenses SF Pro for Apple platforms only,
 * and Inter is the open face drawn closest to it. Sizes and line heights are Apple's Dynamic
 * Type defaults (this phone's 393dp width matches an iPhone 15's 393pt). Tracking is Inter's
 * own size-based curve, which is what makes it set like SF. Each style names its weight's
 * font file: never add fontWeight on top, Android would fake-bold it.
 */
export const iosType = StyleSheet.create({
  largeTitle: {fontFamily: loginFonts.bold, fontSize: 34, lineHeight: 41, letterSpacing: -0.74},
  title1: {fontFamily: loginFonts.bold, fontSize: 28, lineHeight: 34, letterSpacing: -0.58},
  title2: {fontFamily: loginFonts.bold, fontSize: 22, lineHeight: 28, letterSpacing: -0.4},
  title3: {fontFamily: loginFonts.semibold, fontSize: 20, lineHeight: 25, letterSpacing: -0.33},
  headline: {fontFamily: loginFonts.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.22},
  body: {fontFamily: loginFonts.regular, fontSize: 17, lineHeight: 22, letterSpacing: -0.22},
  callout: {fontFamily: loginFonts.regular, fontSize: 16, lineHeight: 21, letterSpacing: -0.18},
  subheadline: {fontFamily: loginFonts.regular, fontSize: 15, lineHeight: 20, letterSpacing: -0.13},
  footnote: {fontFamily: loginFonts.regular, fontSize: 13, lineHeight: 18, letterSpacing: -0.04},
  caption1: {fontFamily: loginFonts.regular, fontSize: 12, lineHeight: 16, letterSpacing: 0},
  caption2: {fontFamily: loginFonts.regular, fontSize: 11, lineHeight: 13, letterSpacing: 0.05},
});

/** Weight swaps for an iosType style, e.g. [iosType.subheadline, iosWeight.semibold]. */
export const iosWeight = StyleSheet.create({
  regular: {fontFamily: loginFonts.regular},
  semibold: {fontFamily: loginFonts.semibold},
  bold: {fontFamily: loginFonts.bold},
});

/** Signed-in launches skip the auth stack that normally loads Inter; screens using iosType call this. */
export function useIosFonts(): void {
  useFonts(loginFontAssets);
}
