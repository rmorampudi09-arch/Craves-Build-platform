import React from 'react';
import {StyleSheet, View} from 'react-native';
import {colors} from '../../../design/tokens';
import {CustomerChefFace} from './CustomerChefFace';

interface Props {
  imageUrl?: string | null;
  size?: number;
}

export function CustomerChefAvatar({imageUrl = null, size = 48}: Props) {
  const frameStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
  } as const;

  return (
    <View accessibilityElementsHidden style={[styles.frame, frameStyle]}>
      <CustomerChefFace url={imageUrl} fallback={null} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    flexShrink: 0,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceMuted,
  },
});
