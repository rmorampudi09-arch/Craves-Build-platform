import React from 'react';
import {StyleSheet, View} from 'react-native';
import {colors, radius} from '../../../../design/tokens';

export type VegMarkType = 'VEG' | 'NON_VEG' | 'EGG';

const MARKS: Record<VegMarkType, {color: string; label: string}> = {
  VEG: {color: colors.successText, label: 'Vegetarian'},
  NON_VEG: {color: colors.error, label: 'Non-vegetarian'},
  EGG: {color: colors.warning, label: 'Contains egg'},
};

/** The food-type square: green dot, red triangle or amber dot inside a 14 dp outline. */
export function VegMark({type}: {type: VegMarkType}) {
  const {color, label} = MARKS[type];
  return (
    <View accessible accessibilityLabel={label} accessibilityRole="image" style={[styles.box, {borderColor: color}]}>
      {type === 'NON_VEG' ? (
        <View style={[styles.triangle, {borderBottomColor: color}]} />
      ) : (
        <View style={[styles.dot, {backgroundColor: color}]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: 14,
    height: 14,
    borderWidth: 1.5,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {width: 6, height: 6, borderRadius: radius.pill},
  triangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
});
