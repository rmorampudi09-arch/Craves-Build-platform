import React from 'react';
import House from 'lucide-react-native/icons/house';
import ChefHat from 'lucide-react-native/icons/chef-hat';
import ClipboardList from 'lucide-react-native/icons/clipboard-list';
import UserRound from 'lucide-react-native/icons/user-round';
import ChartNoAxesColumnIncreasing from 'lucide-react-native/icons/chart-no-axes-column-increasing';
import { bottomMenu } from '../../design/tokens';

const MENU_ICONS = {
  home: House,
  chef: ChefHat,
  orders: ClipboardList,
  account: UserRound,
  analytics: ChartNoAxesColumnIncreasing,
} as const;

export function BottomMenuIcon({
  name,
  color,
  size,
}: {
  name: keyof typeof MENU_ICONS;
  color: string;
  size: number;
}) {
  const MenuIcon = MENU_ICONS[name];
  return (
    <MenuIcon
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      color={color}
      size={size}
      strokeWidth={bottomMenu.iconStrokeWidth}
    />
  );
}
