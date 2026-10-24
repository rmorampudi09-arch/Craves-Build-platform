import React from 'react';
import { StyleSheet, View } from 'react-native';
import House from 'lucide-react-native/icons/house';
import ChefHat from 'lucide-react-native/icons/chef-hat';
import ClipboardList from 'lucide-react-native/icons/clipboard-list';
import UserRound from 'lucide-react-native/icons/user-round';
import ChartNoAxesColumnIncreasing from 'lucide-react-native/icons/chart-no-axes-column-increasing';
import Wallet from 'lucide-react-native/icons/wallet';
import { bottomMenu } from '../../design/tokens';

const MENU_ICONS = {
  home: House,
  chef: ChefHat,
  orders: ClipboardList,
  account: UserRound,
  analytics: ChartNoAxesColumnIncreasing,
  wallet: Wallet,
} as const;

export function BottomMenuIcon({
  name,
  color,
  size,
  glow = false,
}: {
  name: keyof typeof MENU_ICONS;
  color: string;
  size: number;
  glow?: boolean;
}) {
  const MenuIcon = MENU_ICONS[name];
  const icon = (
    <MenuIcon
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      color={color}
      size={size}
      strokeWidth={bottomMenu.iconStrokeWidth}
    />
  );
  if (!glow) return icon;
  // Wider, faint copies of the same stroke behind the icon read as a soft halo.
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
    >
      {bottomMenu.glowLayers.map(layer => (
        <MenuIcon
          key={layer.strokeWidth}
          color={bottomMenu.glowColor}
          size={size}
          strokeWidth={layer.strokeWidth}
          opacity={layer.opacity}
          style={StyleSheet.absoluteFill}
        />
      ))}
      {icon}
    </View>
  );
}
