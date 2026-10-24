import type {IconName} from '../../shared/components/Icon';
import {bottomMenu} from '../../design/tokens';
import type {ChefOrdersStackRouteName, ChefTabRouteName} from './types';

export interface ChefTabDefinition {
  routeName: ChefTabRouteName;
  label: string;
  icon: IconName;
}

/** Ordered product contract for the Chef bottom navigation. */
export const CHEF_TABS: readonly ChefTabDefinition[] = [
  {routeName: 'Dashboard', label: 'Home', icon: 'home'},
  {routeName: 'Orders', label: 'Orders', icon: 'orders'},
  {routeName: 'Menu', label: 'Menu', icon: 'chef'},
  {routeName: 'Earnings', label: 'Earnings', icon: 'wallet'},
  {routeName: 'Profile', label: 'Profile', icon: 'account'},
] as const;

// Same colours as the customer menu bar.
export const CHEF_TAB_ACTIVE_COLOR = bottomMenu.activeColor;
export const CHEF_TAB_INACTIVE_COLOR = bottomMenu.inactiveColor;

/** Every Orders-stack route; the navigator registers one screen for each. */
export const CHEF_ORDER_ROUTES = [
  'ChefOrdersNew',
  'ChefOrdersPreparing',
  'ChefOrdersReady',
  'ChefOrdersCompleted',
  'ChefOrdersScheduled',
] as const satisfies readonly ChefOrdersStackRouteName[];

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
