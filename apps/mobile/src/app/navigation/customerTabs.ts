import type {IconName} from '../../shared/components/Icon';
import {colors} from '../../design/tokens';
import type {CustomerTabRouteName} from './types';

export interface CustomerTabDefinition {
  routeName: CustomerTabRouteName;
  label: string;
  icon: IconName;
}

/** Ordered product contract for the customer bottom navigation. */
export const CUSTOMER_TABS: readonly CustomerTabDefinition[] = [
  {routeName: 'Home', label: 'Home', icon: 'home'},
  {routeName: 'Chefs', label: 'Chefs', icon: 'chef'},
  {routeName: 'Orders', label: 'Orders', icon: 'orders'},
  {routeName: 'Profile', label: 'Profile', icon: 'account'},
] as const;

export const CUSTOMER_TAB_ACTIVE_COLOR = colors.flameRed;
export const CUSTOMER_TAB_INACTIVE_COLOR = colors.mutedText;

/**
 * P25 deliberately preserves navigator state on blur. Scroll-driven tab-bar
 * visibility belongs to P26 and is not enabled here.
 */
export const CUSTOMER_TAB_STATE_OPTIONS = {
  lazy: true,
  popToTopOnBlur: false,
} as const;

export function getCustomerTabDefinition(
  routeName: CustomerTabRouteName,
): CustomerTabDefinition {
  const definition = CUSTOMER_TABS.find(tab => tab.routeName === routeName);

  if (!definition) {
    throw new Error(`Unknown customer tab route: ${routeName}`);
  }

  return definition;
}
