import React, {useContext, type ComponentType} from 'react';
import {StyleSheet, type StyleProp, type TextStyle} from 'react-native';

/**
 * Inter is the app-wide stand-in for Apple's SF Pro (licensed for Apple platforms only).
 * MainApplication registers it natively with real 400/600/700 files, so fontWeight works.
 * On iOS the name is unregistered and text falls back to the system face, which is SF itself.
 */
export const APP_FONT_FAMILY = 'Inter';

/** Inter's size-based tracking (rsms.me/inter/dynmetrics): tighter as text grows, like SF Pro. */
export function interTracking(fontSize: number): number {
  return Math.round(fontSize * (-0.0223 + 0.185 * Math.exp(-0.1745 * fontSize)) * 100) / 100;
}

/** Puts Inter under a style that names no font; a style's own font or tracking still wins. */
export function withAppFont(style: StyleProp<TextStyle>): StyleProp<TextStyle> {
  const flat = StyleSheet.flatten(style) ?? {};
  if (flat.fontFamily) return style;
  return [{fontFamily: APP_FONT_FAMILY, letterSpacing: interTracking(flat.fontSize ?? 14)}, style];
}

type StyledProps = {style?: StyleProp<TextStyle>};

/**
 * React Native has no default-font setting, so this swaps the Text and TextInput that
 * `import {Text} from 'react-native'` returns (its getters re-read these modules on each access).
 * Call once from index.js before the app renders.
 * shortcut: relies on React Native's Libraries/ paths; recheck them on every React Native upgrade.
 */
export function installAppFont(): void {
  /* eslint-disable @react-native/no-deep-imports -- no public API for a default font */
  const textModule = require('react-native/Libraries/Text/Text');
  const textInputModule = require('react-native/Libraries/Components/TextInput/TextInput');
  const TextAncestorContext: React.Context<boolean> =
    require('react-native/Libraries/Text/TextAncestorContext').default;
  /* eslint-enable @react-native/no-deep-imports */

  const BaseText: ComponentType<StyledProps> = textModule.default;
  // Nested Text inherits its parent's font, so only the outermost Text gets the default.
  function AppText(props: StyledProps) {
    const nested = useContext(TextAncestorContext);
    return <BaseText {...props} style={nested ? props.style : withAppFont(props.style)} />;
  }
  textModule.default = Object.assign(AppText, BaseText);

  const BaseTextInput: ComponentType<StyledProps> = textInputModule.default;
  function AppTextInput(props: StyledProps) {
    return <BaseTextInput {...props} style={withAppFont(props.style)} />;
  }
  // Keeps statics such as TextInput.State, which keyboard libraries call.
  textInputModule.default = Object.assign(AppTextInput, BaseTextInput);
}
