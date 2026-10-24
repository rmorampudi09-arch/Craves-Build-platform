import React, {createContext, useContext} from 'react';
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
  | 'gps'
  | 'plus'
  | 'close'
  | 'work'
  | 'edit'
  | 'location-off'
  | 'cloud-off'
  | 'search-off'
  | 'alert'
  | 'chevron-down'
  | 'pause'
  | 'calendar'
  | 'calendar-check'
  | 'location-outline'
  | 'meal'
  | 'play'
  | 'renew'
  | 'calendar-remove'
  | 'receipt'
  | 'camera'
  | 'store'
  | 'id-card'
  | 'bank'
  | 'image'
  | 'upload'
  | 'more'
  | 'camera-plus'
  | 'copy'
  | 'send'
  | 'refresh';

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  /** Bottom/menu bars opt out; others get a size box, soft-red filled (glyph at 74%) only under IconTileContext. */
  surface?: boolean;
}

/** True only on Home: icons keep their soft-red circle there; every other screen shows the bare glyph. */
export const IconTileContext = createContext(false);

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
  settings: 'cog',
  wallet: 'wallet-outline',
  crown: 'crown-outline',
  gift: 'gift-outline',
  headset: 'headset',
  translate: 'translate',
  theme: 'theme-light-dark',
  document: 'file-document-outline',
  info: 'information-outline',
  gps: 'crosshairs-gps',
  plus: 'plus',
  close: 'close',
  work: 'briefcase-outline',
  edit: 'pencil-outline',
  'location-off': 'map-marker-off-outline',
  'cloud-off': 'cloud-off-outline',
  'search-off': 'magnify-close',
  alert: 'alert-circle-outline',
  'chevron-down': 'chevron-down',
  pause: 'pause',
  calendar: 'calendar-blank-outline',
  'calendar-check': 'calendar-check-outline',
  'location-outline': 'map-marker-outline',
  meal: 'silverware-fork-knife',
  play: 'play',
  renew: 'autorenew',
  'calendar-remove': 'calendar-remove-outline',
  receipt: 'receipt-text-outline',
  camera: 'camera-outline',
  store: 'storefront-outline',
  'id-card': 'card-account-details-outline',
  bank: 'bank-outline',
  image: 'image-outline',
  upload: 'tray-arrow-up',
  more: 'dots-vertical',
  'camera-plus': 'camera-plus-outline',
  copy: 'content-copy',
  send: 'send',
  refresh: 'refresh',
};

export function Icon({
  name,
  size = iconSize.md,
  surface = true,
  color = surface ? colors.flameRed : colors.espressoBrown,
}: Props) {
  const tile = useContext(IconTileContext);
  // Only a tiled glyph shrinks to fit its circle; a bare icon draws at its full size.
  const glyphSize = surface && tile ? Math.max(14, Math.round(size * 0.74)) : size;
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
        tile && styles.tile,
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
  },
  tile: {backgroundColor: colors.iconSurface},
});
