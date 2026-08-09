import {z} from 'zod';

export const PROCESS_RESTORATION_VERSION = 1 as const;

export type ProductRole = 'CUSTOMER' | 'CHEF';
export type CustomerRestorableTab = 'Home' | 'Chefs' | 'Orders' | 'Profile';
export type ChefRestorableTab = 'Dashboard' | 'Orders' | 'Menu' | 'Analytics' | 'Profile';

type NavigationRouteLike = {
  name: string;
  params?: unknown;
  state?: NavigationStateLike;
};

export type NavigationStateLike = {
  index?: number;
  routes: readonly NavigationRouteLike[];
};

const resourceIdSchema = z.string().min(1).max(160);
const customerTabSchema = z.enum(['Home', 'Chefs', 'Orders', 'Profile']);
const chefTabSchema = z.enum(['Dashboard', 'Orders', 'Menu', 'Analytics', 'Profile']);

const customerNoParamScreenSchema = z.enum([
  'CustomerCart',
  'CustomerPaymentMethods',
  'CustomerAddresses',
  'CustomerFavorites',
  'CustomerNotifications',
  'CustomerSettings',
  'CustomerSettingsNotifications',
  'CustomerSettingsPrivacySecurity',
  'CustomerSettingsChangePassword',
  'CustomerSettingsLanguage',
  'CustomerSettingsAppearance',
  'CustomerSettingsAbout',
  'CustomerSettingsShare',
  'CustomerSettingsReferral',
  'CustomerSettingsSupport',
  'CustomerSettingsSubscription',
  'CustomerSettingsLegal',
]);

const customerResourceScreenSchema = z.discriminatedUnion('screen', [
  z.object({screen: z.literal('CustomerDishDetail'), menuItemId: resourceIdSchema}).strict(),
  z.object({screen: z.literal('CustomerDishIngredients'), menuItemId: resourceIdSchema}).strict(),
  z.object({screen: z.literal('CustomerKitchenProfile'), kitchenId: resourceIdSchema}).strict(),
  z.object({screen: z.literal('CustomerKitchenDishes'), kitchenId: resourceIdSchema}).strict(),
  z.object({screen: z.literal('CustomerOrderDetail'), orderId: resourceIdSchema}).strict(),
  z.object({screen: z.literal('CustomerOrderTracking'), orderId: resourceIdSchema}).strict(),
]);

const chefNestedScreenSchema = z.enum([
  'ChefOrdersPreparing',
  'ChefOrdersNew',
  'ChefOrdersReady',
  'ChefOrdersCompleted',
  'ChefProfileHome',
  'ChefBusinessInformation',
  'ChefPayoutHistory',
  'ChefSubscriptionPlan',
  'ChefAppPreferences',
]);

const chefProductScreenSchema = z.discriminatedUnion('screen', [
  z.object({screen: z.literal('ChefOrderDetail'), orderId: resourceIdSchema}).strict(),
  z.object({screen: z.literal('ChefMenuItemDetail'), menuItemId: resourceIdSchema}).strict(),
]);

const targetSchema = z.discriminatedUnion('kind', [
  z.object({kind: z.literal('CUSTOMER_TAB'), tab: customerTabSchema}).strict(),
  z.object({kind: z.literal('CUSTOMER_SCREEN'), tab: customerTabSchema, screen: customerNoParamScreenSchema}).strict(),
  z.object({kind: z.literal('CUSTOMER_RESOURCE'), tab: customerTabSchema, route: customerResourceScreenSchema}).strict(),
  z.object({kind: z.literal('CHEF_TAB'), tab: chefTabSchema}).strict(),
  z.object({kind: z.literal('CHEF_NESTED'), tab: z.enum(['Orders', 'Profile']), screen: chefNestedScreenSchema}).strict(),
  z.object({kind: z.literal('CHEF_PRODUCT'), route: chefProductScreenSchema}).strict(),
]);

const snapshotSchema = z.object({
  version: z.literal(PROCESS_RESTORATION_VERSION),
  role: z.enum(['CUSTOMER', 'CHEF']),
  target: targetSchema,
}).strict();

export type ProcessRestorationSnapshot = z.infer<typeof snapshotSchema>;

export type RestorationNavigatePayload = {
  name: string;
  params?: Record<string, unknown>;
};

function ownRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function safeResourceParam(params: unknown, key: string): string | null {
  const value = ownRecord(params)?.[key];
  return resourceIdSchema.safeParse(value).success ? (value as string) : null;
}

function activeRouteChain(state: NavigationStateLike): NavigationRouteLike[] {
  const chain: NavigationRouteLike[] = [];
  let current: NavigationStateLike | undefined = state;

  while (current?.routes.length) {
    const index = Math.min(Math.max(current.index ?? 0, 0), current.routes.length - 1);
    const route = current.routes[index];
    chain.push(route);
    current = route.state;
  }

  return chain;
}

function customerTabFallback(tab: CustomerRestorableTab): ProcessRestorationSnapshot {
  return {
    version: PROCESS_RESTORATION_VERSION,
    role: 'CUSTOMER',
    target: {kind: 'CUSTOMER_TAB', tab},
  };
}

function captureCustomer(chain: NavigationRouteLike[]): ProcessRestorationSnapshot | null {
  const tabResult = customerTabSchema.safeParse(chain[0]?.name);
  if (!tabResult.success) return null;
  const tab = tabResult.data;
  const leaf = chain[chain.length - 1];
  if (!leaf || chain.length === 1) return customerTabFallback(tab);

  const noParamResult = customerNoParamScreenSchema.safeParse(leaf.name);
  if (noParamResult.success) {
    // Draft-bearing forms are intentionally excluded from this allowlist. Only
    // non-sensitive route context is persisted; form contents remain memory-only.
    return {
      version: PROCESS_RESTORATION_VERSION,
      role: 'CUSTOMER',
      target: {kind: 'CUSTOMER_SCREEN', tab, screen: noParamResult.data},
    };
  }

  if (leaf.name === 'CustomerDishDetail' || leaf.name === 'CustomerDishIngredients') {
    const menuItemId = safeResourceParam(leaf.params, 'menuItemId');
    return menuItemId
      ? {
          version: PROCESS_RESTORATION_VERSION,
          role: 'CUSTOMER',
          target: {kind: 'CUSTOMER_RESOURCE', tab, route: {screen: leaf.name, menuItemId}},
        }
      : customerTabFallback(tab);
  }

  if (leaf.name === 'CustomerKitchenProfile' || leaf.name === 'CustomerKitchenDishes') {
    const kitchenId = safeResourceParam(leaf.params, 'kitchenId');
    return kitchenId
      ? {
          version: PROCESS_RESTORATION_VERSION,
          role: 'CUSTOMER',
          target: {kind: 'CUSTOMER_RESOURCE', tab, route: {screen: leaf.name, kitchenId}},
        }
      : customerTabFallback(tab);
  }

  if (leaf.name === 'CustomerOrderDetail' || leaf.name === 'CustomerOrderTracking') {
    const orderId = safeResourceParam(leaf.params, 'orderId');
    return orderId
      ? {
          version: PROCESS_RESTORATION_VERSION,
          role: 'CUSTOMER',
          target: {kind: 'CUSTOMER_RESOURCE', tab, route: {screen: leaf.name, orderId}},
        }
      : customerTabFallback(tab);
  }

  // Filter forms and profile-edit drafts can contain transient user work. Until a
  // dedicated approved draft-retention policy exists, restore their owning tab
  // instead of serializing or pretending to restore the draft.
  return customerTabFallback(tab);
}

function chefTabFallback(tab: ChefRestorableTab): ProcessRestorationSnapshot {
  return {
    version: PROCESS_RESTORATION_VERSION,
    role: 'CHEF',
    target: {kind: 'CHEF_TAB', tab},
  };
}

function captureChef(chain: NavigationRouteLike[]): ProcessRestorationSnapshot | null {
  const outer = chain[0];
  if (!outer) return null;

  if (outer.name === 'ChefOrderDetail') {
    const orderId = safeResourceParam(outer.params, 'orderId');
    return orderId
      ? {
          version: PROCESS_RESTORATION_VERSION,
          role: 'CHEF',
          target: {kind: 'CHEF_PRODUCT', route: {screen: 'ChefOrderDetail', orderId}},
        }
      : chefTabFallback('Orders');
  }

  if (outer.name === 'ChefMenuItemDetail') {
    const menuItemId = safeResourceParam(outer.params, 'menuItemId');
    return menuItemId
      ? {
          version: PROCESS_RESTORATION_VERSION,
          role: 'CHEF',
          target: {kind: 'CHEF_PRODUCT', route: {screen: 'ChefMenuItemDetail', menuItemId}},
        }
      : chefTabFallback('Menu');
  }

  // Add/Edit Menu and other mutable product forms are deliberately collapsed to
  // their safe owner instead of persisting draft fields or provider/session data.
  if (outer.name === 'ChefAddMenuItem' || outer.name === 'ChefEditMenuItem') {
    return chefTabFallback('Menu');
  }

  if (outer.name !== 'ChefTabs') return null;

  const tabResult = chefTabSchema.safeParse(chain[1]?.name);
  if (!tabResult.success) return chefTabFallback('Dashboard');
  const tab = tabResult.data;
  const leaf = chain[chain.length - 1];

  if (tab === 'Orders' && leaf && leaf.name !== 'Orders') {
    const nested = chefNestedScreenSchema.safeParse(leaf.name);
    if (nested.success && nested.data.startsWith('ChefOrders')) {
      return {
        version: PROCESS_RESTORATION_VERSION,
        role: 'CHEF',
        target: {kind: 'CHEF_NESTED', tab: 'Orders', screen: nested.data},
      };
    }
  }

  if (tab === 'Profile' && leaf && leaf.name !== 'Profile') {
    if (leaf.name === 'ChefEditProfile') return chefTabFallback('Profile');
    const nested = chefNestedScreenSchema.safeParse(leaf.name);
    if (nested.success && !nested.data.startsWith('ChefOrders')) {
      return {
        version: PROCESS_RESTORATION_VERSION,
        role: 'CHEF',
        target: {kind: 'CHEF_NESTED', tab: 'Profile', screen: nested.data},
      };
    }
  }

  return chefTabFallback(tab);
}

export function captureProcessRestorationSnapshot(
  state: NavigationStateLike,
  role: ProductRole,
): ProcessRestorationSnapshot | null {
  const chain = activeRouteChain(state);
  return role === 'CUSTOMER' ? captureCustomer(chain) : captureChef(chain);
}

function isRoleConsistent(snapshot: ProcessRestorationSnapshot): boolean {
  return snapshot.role === 'CUSTOMER'
    ? snapshot.target.kind.startsWith('CUSTOMER_')
    : snapshot.target.kind.startsWith('CHEF_');
}

function isNestedPairConsistent(snapshot: ProcessRestorationSnapshot): boolean {
  if (snapshot.target.kind !== 'CHEF_NESTED') return true;
  return snapshot.target.tab === 'Orders'
    ? snapshot.target.screen.startsWith('ChefOrders')
    : !snapshot.target.screen.startsWith('ChefOrders');
}

export function parseProcessRestorationSnapshot(value: unknown): ProcessRestorationSnapshot | null {
  const parsed = snapshotSchema.safeParse(value);
  if (!parsed.success || !isRoleConsistent(parsed.data) || !isNestedPairConsistent(parsed.data)) {
    return null;
  }
  return parsed.data;
}

export function toRestorationNavigatePayload(
  snapshot: ProcessRestorationSnapshot,
): RestorationNavigatePayload | null {
  if (!isRoleConsistent(snapshot) || !isNestedPairConsistent(snapshot)) return null;
  const {target} = snapshot;

  if (target.kind === 'CUSTOMER_TAB') {
    return {name: target.tab};
  }
  if (target.kind === 'CUSTOMER_SCREEN') {
    return {name: target.tab, params: {screen: target.screen}};
  }
  if (target.kind === 'CUSTOMER_RESOURCE') {
    const {screen, ...params} = target.route;
    return {name: target.tab, params: {screen, params}};
  }
  if (target.kind === 'CHEF_TAB') {
    return {
      name: 'ChefTabs',
      params: {screen: target.tab},
    };
  }
  if (target.kind === 'CHEF_NESTED') {
    return {
      name: 'ChefTabs',
      params: {screen: target.tab, params: {screen: target.screen}},
    };
  }

  const {screen, ...params} = target.route;
  return {name: screen, params};
}
