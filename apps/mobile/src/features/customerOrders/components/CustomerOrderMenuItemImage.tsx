import React from 'react';
import {Image, StyleSheet, View} from 'react-native';
import {colors, radius} from '../../../design/tokens';
import {useCustomerOrderMenuItemImageQuery} from '../query/customerOrderCatalogQueries';

interface Props {
  menuItemId: string;
  size?: number;
}

export function CustomerOrderMenuItemImage({menuItemId, size = 48}: Props) {
  const image = useCustomerOrderMenuItemImageQuery(menuItemId);
  const frameStyle = {width: size, height: size} as const;

  if (image.data) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        source={{uri: image.data}}
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
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
});
