import type {IconName} from '../../../shared/components/Icon';
import type {CustomerProfileIdentity} from '../domain/customerProfileContract';

export const CUSTOMER_PROFILE_ROUTE_BLOCKER_REASON =
  'not-registered-in-approved-mobile-route-contract' as const;

export type CustomerProfileMenuAction =
  | 'route-favorites'
  | 'route-meal-plans'
  | 'route-payments'
  | 'route-referral'
  | 'route-support'
  | 'switch-chef'
  | 'logout';

export interface CustomerProfileMenuRowModel {
  id:
    | 'favorites'
    | 'meal-plans'
    | 'payments'
    | 'referral'
    | 'contact'
    | 'switch-chef'
    | 'logout';
  title: string;
  subtitle: string;
  icon: IconName;
  action: CustomerProfileMenuAction;
}

export const CUSTOMER_PROFILE_MENU_ROWS: readonly CustomerProfileMenuRowModel[] = [
  {
    id: 'favorites',
    title: 'Saved',
    subtitle: 'Dishes and home chefs',
    icon: 'heart',
    action: 'route-favorites',
  },
  {
    id: 'meal-plans',
    title: 'Meal plans',
    subtitle: 'Your plans and how they work',
    icon: 'calendar-check',
    action: 'route-meal-plans',
  },
  {
    id: 'payments',
    title: 'Payments',
    subtitle: 'UPI, cards and wallets',
    icon: 'wallet',
    action: 'route-payments',
  },
  {
    id: 'referral',
    title: 'Refer a friend',
    subtitle: 'Share Craves with friends',
    icon: 'gift',
    action: 'route-referral',
  },
  {
    id: 'contact',
    title: 'Contact us',
    subtitle: 'Chat, call or email',
    icon: 'headset',
    action: 'route-support',
  },
  {
    id: 'switch-chef',
    title: 'Switch to Chef mode',
    subtitle: 'Use Craves as a chef',
    icon: 'chef',
    action: 'switch-chef',
  },
  {
    id: 'logout',
    title: 'Log out',
    subtitle: 'Sign out of this device',
    icon: 'lock',
    action: 'logout',
  },
] as const;

export function resolveCustomerProfileDisplayName(
  profile: CustomerProfileIdentity,
): string {
  return (
    profile.displayName ??
    profile.firstName ??
    profile.email ??
    'Craves customer'
  );
}

export function resolveCustomerProfileInitials(
  profile: CustomerProfileIdentity,
): string {
  const source = resolveCustomerProfileDisplayName(profile).trim();
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase() || 'C';
}

export function resolveCustomerProfilePhoneLabel(
  profile: CustomerProfileIdentity,
): string {
  return profile.registeredPhone.last4
    ? `Phone •••• ${profile.registeredPhone.last4}`
    : 'No phone number on your account';
}
