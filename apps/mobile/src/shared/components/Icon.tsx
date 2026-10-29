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
  | 'info'
  | 'send'
  | 'alert'
  | 'refresh'
  // Outline glyphs for the rider app (docs/riders/SCREENS.md 0.14); the name is the glyph.
  | 'account-outline'
  | 'arrow-right'
  | 'calendar-blank-outline'
  | 'camera-outline'
  | 'check-circle'
  | 'checkbox-blank-outline'
  | 'checkbox-marked'
  | 'chevron-left'
  | 'clock-outline'
  | 'close'
  | 'cloud-off-outline'
  | 'home-outline'
  | 'inbox-outline'
  | 'lock-outline'
  | 'map-marker-outline'
  | 'menu-down'
  | 'menu-right'
  | 'moped'
  | 'navigation-variant-outline'
  | 'phone-outline'
  | 'progress-clock'
  | 'shield-alert-outline'
  | 'shield-check-outline'
  | 'weather-pouring';

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
  send: 'send',
  alert: 'alert-circle-outline',
  refresh: 'refresh',
  'account-outline': 'account-outline',
  'arrow-right': 'arrow-right',
  'calendar-blank-outline': 'calendar-blank-outline',
  'camera-outline': 'camera-outline',
  'check-circle': 'check-circle',
  'checkbox-blank-outline': 'checkbox-blank-outline',
  'checkbox-marked': 'checkbox-marked',
  'chevron-left': 'chevron-left',
  'clock-outline': 'clock-outline',
  'close': 'close',
  'cloud-off-outline': 'cloud-off-outline',
  'home-outline': 'home-outline',
  'inbox-outline': 'inbox-outline',
  'lock-outline': 'lock-outline',
  'map-marker-outline': 'map-marker-outline',
  'menu-down': 'menu-down',
  'menu-right': 'menu-right',
  'moped': 'moped',
  'navigation-variant-outline': 'navigation-variant-outline',
  'phone-outline': 'phone-outline',
  'progress-clock': 'progress-clock',
  'shield-alert-outline': 'shield-alert-outline',
  'shield-check-outline': 'shield-check-outline',
  'weather-pouring': 'weather-pouring',
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
