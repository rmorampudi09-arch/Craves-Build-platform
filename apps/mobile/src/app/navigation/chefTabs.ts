import type {IconName} from '../../shared/components/Icon';
import {colors} from '../../design/tokens';
import type {ChefTabRouteName} from './types';

export interface ChefTabDefinition {
  routeName: ChefTabRouteName;
  label: string;
  icon: IconName;
}

/** Ordered product contract for the Chef bottom navigation. */
export const CHEF_TABS: readonly ChefTabDefinition[] = [
  {routeName: 'Dashboard', label: 'Dashboard', icon: 'home'},
  {routeName: 'Orders', label: 'Orders', icon: 'orders'},
  {routeName: 'Menu', label: 'Menu', icon: 'chef'},
  {routeName: 'Analytics', label: 'Analytics', icon: 'analytics'},
  {routeName: 'Profile', label: 'Profile', icon: 'account'},
] as const;

export const CHEF_TAB_ACTIVE_COLOR = colors.flameRed;
export const CHEF_TAB_INACTIVE_COLOR = colors.mutedText;

/** Keep each Chef tab mounted so its local navigation/UI state survives tab changes. */
export const CHEF_TAB_STATE_OPTIONS = {
  lazy: true,
  popToTopOnBlur: false,
} as const;

export function getChefTabDefinition(routeName: ChefTabRouteName): ChefTabDefinition {
  const definition = CHEF_TABS.find(tab => tab.routeName === routeName);

  if (!definition) {
    throw new Error(`Unknown Chef tab route: ${routeName}`);
  }

  return definition;
}
