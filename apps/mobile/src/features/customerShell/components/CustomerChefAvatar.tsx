import React from 'react';
import {Image, StyleSheet, View} from 'react-native';
import {colors} from '../../../design/tokens';

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

  if (imageUrl) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        source={{uri: imageUrl}}
        resizeMode="cover"
        style={[styles.frame, frameStyle]}
      />
    );
  }

  return <View accessibilityElementsHidden style={[styles.frame, frameStyle]} />;
}

const styles = StyleSheet.create({
  frame: {
    flexShrink: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceMuted,
  },
});
