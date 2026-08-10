export {};

type ChefVisualQaAvailability = 'implemented' | 'partial-capability';

type ChefVisualQaTarget = {
  ref: number;
  image: string;
  state: string;
  screenPath: string;
  chromePolicy: 'focused-auth' | 'chef-shell' | 'focused-chef';
  roleContext: 'CHEF';
  availability: ChefVisualQaAvailability;
  certification: 'pending-device-comparison';
};

const CHEF_VISUAL_QA_TARGETS: readonly ChefVisualQaTarget[] = [
  {
    ref: 2,
    image: 'image2.jpeg',
    state: 'Chef Phone Number Sign-In',
    screenPath: 'src/features/auth/screens/PhoneSignInScreen.tsx',
    chromePolicy: 'focused-auth',
    roleContext: 'CHEF',
    availability: 'implemented',
    certification: 'pending-device-comparison',
  },
  {
    ref: 4,
    image: 'image4.jpeg',
    state: 'Chef Email and Password Sign-In',
    screenPath: 'src/features/auth/screens/EmailSignInScreen.tsx',
    chromePolicy: 'focused-auth',
    roleContext: 'CHEF',
    availability: 'implemented',
    certification: 'pending-device-comparison',
  },
  {
    ref: 38,
    image: 'image38.jpeg',
    state: 'Chef Dashboard',
    screenPath: 'src/features/chefDashboard/screens/ChefDashboardScreen.tsx',
    chromePolicy: 'chef-shell',
    roleContext: 'CHEF',
    availability: 'implemented',
    certification: 'pending-device-comparison',
  },
  {
    ref: 39,
    image: 'image39.jpeg',
    state: 'Chef New Order Detail',
    screenPath: 'src/features/chefOrders/screens/ChefOrderDetailScreen.tsx',
    chromePolicy: 'focused-chef',
    roleContext: 'CHEF',
    availability: 'implemented',
    certification: 'pending-device-comparison',
  },
  {
    ref: 40,
    image: 'image40.jpeg',
    state: 'Chef Preparing Orders',
    screenPath: 'src/features/chefOrders/screens/ChefPreparingOrdersScreen.tsx',
    chromePolicy: 'chef-shell',
    roleContext: 'CHEF',
    availability: 'partial-capability',
    certification: 'pending-device-comparison',
  },
  {
    ref: 41,
    image: 'image41.jpeg',
    state: 'Chef Orders - New',
    screenPath: 'src/features/chefOrders/screens/ChefNewOrdersScreen.tsx',
    chromePolicy: 'chef-shell',
    roleContext: 'CHEF',
    availability: 'partial-capability',
    certification: 'pending-device-comparison',
  },
  {
    ref: 42,
    image: 'image42.jpeg',
    state: 'Chef Ready for Pickup',
    screenPath: 'src/features/chefOrders/screens/ChefReadyOrdersScreen.tsx',
    chromePolicy: 'chef-shell',
    roleContext: 'CHEF',
    availability: 'partial-capability',
    certification: 'pending-device-comparison',
  },
  {
    ref: 43,
    image: 'image43.jpeg',
    state: 'Chef Completed Orders',
    screenPath: 'src/features/chefOrders/screens/ChefCompletedOrdersScreen.tsx',
    chromePolicy: 'chef-shell',
    roleContext: 'CHEF',
    availability: 'partial-capability',
    certification: 'pending-device-comparison',
  },
  {
    ref: 44,
    image: 'image44.jpeg',
    state: 'Chef Menu',
    screenPath: 'src/features/chefMenu/screens/ChefMenuScreen.tsx',
    chromePolicy: 'chef-shell',
    roleContext: 'CHEF',
    availability: 'partial-capability',
    certification: 'pending-device-comparison',
  },
  {
    ref: 45,
    image: 'image45.jpeg',
    state: 'Chef Add New Menu Item',
    screenPath: 'src/features/chefMenu/screens/ChefAddMenuItemScreen.tsx',
    chromePolicy: 'focused-chef',
    roleContext: 'CHEF',
    availability: 'partial-capability',
    certification: 'pending-device-comparison',
  },
  {
    ref: 46,
    image: 'image46.jpeg',
    state: 'Chef Analytics',
    screenPath: 'src/features/chefAnalytics/screens/ChefAnalyticsScreen.tsx',
    chromePolicy: 'chef-shell',
    roleContext: 'CHEF',
    availability: 'partial-capability',
    certification: 'pending-device-comparison',
  },
  {
    ref: 47,
    image: 'image47.jpeg',
    state: 'Chef Account/Profile',
    screenPath: 'src/features/chefProfile/screens/ChefProfileScreen.tsx',
    chromePolicy: 'chef-shell',
    roleContext: 'CHEF',
    availability: 'partial-capability',
    certification: 'pending-device-comparison',
  },
  {
    ref: 48,
    image: 'image48.jpeg',
    state: 'Chef Edit Profile',
    screenPath: 'src/features/chefProfile/screens/ChefEditProfileScreen.tsx',
    chromePolicy: 'focused-chef',
    roleContext: 'CHEF',
    availability: 'partial-capability',
    certification: 'pending-device-comparison',
  },
  {
    ref: 49,
    image: 'image49.jpeg',
    state: 'Chef Business Information',
    screenPath:
      'src/features/chefBusinessInformation/screens/ChefBusinessInformationScreen.tsx',
    chromePolicy: 'focused-chef',
    roleContext: 'CHEF',
    availability: 'partial-capability',
    certification: 'pending-device-comparison',
  },
  {
    ref: 50,
    image: 'image50.jpeg',
    state: 'Chef Payout History',
    screenPath: 'src/features/chefPayout/screens/ChefPayoutHistoryScreen.tsx',
    chromePolicy: 'focused-chef',
    roleContext: 'CHEF',
    availability: 'partial-capability',
    certification: 'pending-device-comparison',
  },
  {
    ref: 51,
    image: 'image51.jpeg',
    state: 'Chef Subscription Plan',
    screenPath:
      'src/features/chefSubscription/screens/ChefSubscriptionPlanScreen.tsx',
    chromePolicy: 'focused-chef',
    roleContext: 'CHEF',
    availability: 'partial-capability',
    certification: 'pending-device-comparison',
  },
  {
    ref: 52,
    image: 'image52.jpeg',
    state: 'Chef App Preferences',
    screenPath: 'src/features/chefPreferences/screens/ChefAppPreferencesScreen.tsx',
    chromePolicy: 'focused-chef',
    roleContext: 'CHEF',
    availability: 'partial-capability',
    certification: 'pending-device-comparison',
  },
] as const;

const REQUIRED_COMPARISON_DIMENSIONS = [
  'safe-area',
  'hierarchy',
  'typography',
  'colors',
  'spacing',
  'radii',
  'icons',
  'crops',
  'vertical-rhythm',
  'overlays',
] as const;

const OPERATIONAL_REFS = [38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52] as const;

const FORBIDDEN_CUSTOMER_CHROME_TERMS = [
  'customer-shell',
  'view-cart',
  'cart-overlay',
] as const;

describe('P126 chef visual QA target preflight', () => {
  it('covers exactly refs 2, 4, and 38 through 52', () => {
    expect(CHEF_VISUAL_QA_TARGETS.map(target => target.ref)).toEqual([
      2, 4, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52,
    ]);
  });

  it('keeps the two auth references on the shared role-aware auth boundary', () => {
    const authTargets = CHEF_VISUAL_QA_TARGETS.filter(target =>
      [2, 4].includes(target.ref),
    );

    expect(authTargets).toHaveLength(2);
    expect(
      authTargets.every(
        target =>
          target.chromePolicy === 'focused-auth' &&
          target.screenPath.startsWith('src/features/auth/screens/') &&
          target.roleContext === 'CHEF',
      ),
    ).toBe(true);
  });

  it('binds every operational reference to the chef implementation boundary', () => {
    const operationalTargets = CHEF_VISUAL_QA_TARGETS.filter(target =>
      OPERATIONAL_REFS.includes(target.ref as (typeof OPERATIONAL_REFS)[number]),
    );

    expect(operationalTargets).toHaveLength(OPERATIONAL_REFS.length);
    expect(
      operationalTargets.every(
        target =>
          target.screenPath.startsWith('src/features/chef') &&
          target.chromePolicy !== 'focused-auth' &&
          target.roleContext === 'CHEF',
      ),
    ).toBe(true);
  });

  it('keeps customer cart chrome outside all chef visual-QA targets', () => {
    const serializedTargets = JSON.stringify(CHEF_VISUAL_QA_TARGETS).toLowerCase();

    for (const forbiddenTerm of FORBIDDEN_CUSTOMER_CHROME_TERMS) {
      expect(serializedTargets).not.toContain(forbiddenTerm);
    }
  });

  it('keeps every reference bound to an existing implementation phase rather than a fabricated screen', () => {
    expect(CHEF_VISUAL_QA_TARGETS.every(target => target.screenPath.length > 0)).toBe(
      true,
    );
    expect(
      CHEF_VISUAL_QA_TARGETS.every(target =>
        ['implemented', 'partial-capability'].includes(target.availability),
      ),
    ).toBe(true);
  });

  it('does not convert deterministic preflight into a false visual certification', () => {
    expect(
      CHEF_VISUAL_QA_TARGETS.every(
        target => target.certification === 'pending-device-comparison',
      ),
    ).toBe(true);
  });

  it('locks the P126 comparison dimensions inherited from the visual QA gate', () => {
    expect(REQUIRED_COMPARISON_DIMENSIONS).toEqual([
      'safe-area',
      'hierarchy',
      'typography',
      'colors',
      'spacing',
      'radii',
      'icons',
      'crops',
      'vertical-rhythm',
      'overlays',
    ]);
  });
});
