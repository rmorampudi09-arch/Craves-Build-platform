import type {
  NavigationDomain,
  RegisteredRouteName,
} from './types';

export interface RouteChromePolicy {
  bottomNavigationVisible: boolean;
  viewCartEligible: boolean;
  immersive: boolean;
}

const DOMAIN_DEFAULTS: Record<NavigationDomain, RouteChromePolicy> = {
  Auth: {
    bottomNavigationVisible: false,
    viewCartEligible: false,
    immersive: true,
  },
  Customer: {
    bottomNavigationVisible: true,
    viewCartEligible: true,
    immersive: false,
  },
  Chef: {
    bottomNavigationVisible: true,
    viewCartEligible: false,
    immersive: false,
  },
  Transactional: {
    bottomNavigationVisible: false,
    viewCartEligible: false,
    immersive: true,
  },
  Modal: {
    bottomNavigationVisible: false,
    viewCartEligible: false,
    immersive: true,
  },
};

/**
 * Authentication/account-resolution routes and focused customer utilities are
 * immersive. Standard Customer tab roots intentionally fall through to the
 * Customer domain default.
 */
const CURRENT_IMMERSIVE_ROUTES: ReadonlySet<RegisteredRouteName> = new Set([
  'Splash',
  'RoleSelection',
  'PhoneSignIn',
  'EmailSignIn',
  'OtpVerification',
  'ForgotPassword',
  'PasswordResetSent',
  'AccountRouter',
  'CustomerRegistration',
  'CustomerAccountStatus',
  'ChefRegistration',
  'ChefAccountStatus',
  'StartupError',
  'CustomerFilterSort',
  'CustomerDishDetail',
  'CustomerDishIngredients',
  'CustomerKitchenProfile',
  'CustomerKitchenDishes',
]);

const IMMERSIVE_POLICY: RouteChromePolicy = {
  bottomNavigationVisible: false,
  viewCartEligible: false,
  immersive: true,
};

/**
 * Cart keeps the customer bottom navigation shown by the reference while
 * suppressing the redundant floating View Cart control on the cart itself.
 */
const CART_POLICY: RouteChromePolicy = {
  bottomNavigationVisible: true,
  viewCartEligible: false,
  immersive: false,
};

export function resolveRouteChromePolicy(
  domain: NavigationDomain,
  routeName?: RegisteredRouteName,
): RouteChromePolicy {
  if (routeName === 'CustomerCart') {
    return CART_POLICY;
  }

  if (routeName && CURRENT_IMMERSIVE_ROUTES.has(routeName)) {
    return IMMERSIVE_POLICY;
  }

  return DOMAIN_DEFAULTS[domain];
}

export function isCurrentImmersiveRoute(routeName: RegisteredRouteName): boolean {
  return CURRENT_IMMERSIVE_ROUTES.has(routeName);
}
