import type {IconName} from '../../../shared/components/Icon';
import type {CustomerProfileIdentity} from '../domain/customerProfileContract';

export const CUSTOMER_PROFILE_ROUTE_BLOCKER_REASON =
  'not-registered-in-approved-mobile-route-contract' as const;

export type CustomerProfileMenuAction =
  | 'route-favorites'
  | 'route-payments'
  | 'route-membership'
  | 'route-referral'
  | 'route-support'
  | 'switch-chef'
  | 'logout';

export interface CustomerProfileMenuRowModel {
  id:
    | 'favorites'
    | 'payments'
    | 'membership'
    | 'referral'
    | 'switch-chef'
    | 'contact'
    | 'logout';
  title: string;
  subtitle: string;
  icon: IconName;
  action: CustomerProfileMenuAction;
}

export const CUSTOMER_PROFILE_MENU_ROWS: readonly CustomerProfileMenuRowModel[] = [
  {
    id: 'favorites',
    title: 'Favorites',
    subtitle: 'Saved meals and kitchens',
    icon: 'heart',
    action: 'route-favorites',
  },
  {
    id: 'payments',
    title: 'Payments',
    subtitle: 'Payment methods and preferences',
    icon: 'wallet',
    action: 'route-payments',
  },
  {
    id: 'membership',
    title: 'Membership',
    subtitle: 'Subscription and benefits',
    icon: 'crown',
    action: 'route-membership',
  },
  {
    id: 'referral',
    title: 'Referral to friend',
    subtitle: 'Invite friends and earn rewards',
    icon: 'gift',
    action: 'route-referral',
  },
  {
    id: 'switch-chef',
    title: 'Switch to Chef mode',
    subtitle: 'Use Craves as a chef',
    icon: 'chef',
    action: 'switch-chef',
  },
  {
    id: 'contact',
    title: 'Contact us',
    subtitle: 'Help and support',
    icon: 'headset',
    action: 'route-support',
  },
  {
    id: 'logout',
    title: 'Logout',
    subtitle: 'Sign out of this device',
    icon: 'lock',
    action: 'logout',
  },
] as const;

export const CUSTOMER_PROFILE_EDIT_BLOCKER_MESSAGE =
  'Edit Profile is not registered in the approved mobile route contract yet.';

export const CUSTOMER_PROFILE_REWARDS_UNSUPPORTED_COPY =
  'Rewards balance and tier are not exposed by the approved profile contract yet.';

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
    ? `Registered phone •••• ${profile.registeredPhone.last4}`
    : 'No registered phone on the approved profile record';
}
