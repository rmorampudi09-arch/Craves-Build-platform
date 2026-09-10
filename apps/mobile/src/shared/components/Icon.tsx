import React from 'react';
import {StyleSheet, View} from 'react-native';
import MaterialDesignIcons from '@react-native-vector-icons/material-design-icons';
import {colors, iconSize} from '../../design/tokens';

export type IconName =
  | 'account'
  | 'chef'
  | 'home'
  | 'orders'
  | 'analytics'
  | 'cart'
  | 'search'
  | 'filter'
  | 'wifi-off'
  | 'star'
  | 'ticket'
  | 'phone'
  | 'mail'
  | 'lock'
  | 'eye'
  | 'eye-off'
  | 'chevron-right'
  | 'chevron'
  | 'shield'
  | 'arrow-left'
  | 'check'
  | 'location'
  | 'bell'
  | 'heart'
  | 'clock'
  | 'trash'
  | 'delivery'
  | 'settings'
  | 'wallet'
  | 'crown'
  | 'gift'
  | 'headset'
  | 'translate'
  | 'theme'
  | 'document'
  | 'info';

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  /** Bottom/menu bars opt out; normal app icons use the requested #F1F5F9 surface. */
  surface?: boolean;
}

const GLYPHS: Record<IconName, string> = {
  account: 'account',
  chef: 'chef-hat',
  home: 'home',
  orders: 'clipboard-text',
  analytics: 'chart-bar',
  cart: 'cart',
  search: 'magnify',
  filter: 'tune-variant',
  'wifi-off': 'wifi-off',
  star: 'star',
  ticket: 'ticket-confirmation',
  phone: 'phone',
  mail: 'email',
  lock: 'lock',
  eye: 'eye',
  'eye-off': 'eye-off',
  'chevron-right': 'chevron-right',
  chevron: 'chevron-right',
  shield: 'shield-check',
  'arrow-left': 'arrow-left',
  check: 'check',
  location: 'map-marker',
  bell: 'bell',
  heart: 'heart',
  clock: 'clock',
  trash: 'trash-can',
  delivery: 'truck-delivery',
  settings: 'cog-outline',
  wallet: 'wallet-outline',
  crown: 'crown-outline',
  gift: 'gift-outline',
  headset: 'headset',
  translate: 'translate',
  theme: 'theme-light-dark',
  document: 'file-document-outline',
  info: 'information-outline',
};

export function Icon({
  name,
  size = iconSize.md,
  color = colors.espressoBrown,
  surface = true,
}: Props) {
  const glyphSize = surface ? Math.max(14, Math.round(size * 0.74)) : size;
  if (!surface) {
    return (
      <MaterialDesignIcons
        accessibilityElementsHidden
        color={color}
        name={GLYPHS[name] as never}
        size={glyphSize}
      />
    );
  }
  return (
    <View
      accessibilityElementsHidden
      style={[
        styles.surface,
        {width: size, height: size, borderRadius: Math.max(6, size / 2)},
      ]}>
      <MaterialDesignIcons
        color={color}
        name={GLYPHS[name] as never}
        size={glyphSize}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconSurface,
  },
});
