import React from 'react';
import {Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle} from 'react-native';
import {touchTarget} from '../../../../design/tokens';

/**
 * The tap target of a chip: its own box is 48 dp tall, with the smaller visual chip centred inside it. A hitSlop would
 * not do: a horizontal ScrollView clips it, so the Pressable itself has to be the 48 dp.
 */
export function ChipTap({style, ...rest}: Omit<PressableProps, 'style'> & {style?: StyleProp<ViewStyle>}) {
  return <Pressable {...rest} style={[styles.tap, style]} />;
}

/** Gives back the height a 48 dp tap takes beyond a chip of `chipHeight`, so a row of chips keeps its look; `gapBelow` is the space wanted under the chips. */
export const chipTapOverlap = (chipHeight: number, gapBelow = 0) => {
  const extra = (touchTarget.minimum - chipHeight) / 2;
  return {marginTop: -extra, marginBottom: gapBelow - extra};
};

const styles = StyleSheet.create({
  tap: {minHeight: touchTarget.minimum, justifyContent: 'center'},
});
