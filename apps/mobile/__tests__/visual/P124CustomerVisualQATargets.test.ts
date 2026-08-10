export {};

type CustomerVisualQaTarget = {
  ref: number;
  image: string;
  state: string;
  screenPath: string;
  chromePolicy: 'auth-hidden' | 'customer-shell' | 'focused';
  certification: 'pending-device-comparison';
};

const CUSTOMER_VISUAL_QA_TARGETS: readonly CustomerVisualQaTarget[] = [
  {
    ref: 1,
    image: 'image1.jpeg',
    state: 'Customer Phone Number Sign-In',
    screenPath: 'src/features/auth/screens/PhoneSignInScreen.tsx',
    chromePolicy: 'auth-hidden',
    certification: 'pending-device-comparison',
  },
  {
    ref: 3,
    image: 'image3.jpeg',
    state: 'Customer Email and Password Sign-In',
    screenPath: 'src/features/auth/screens/EmailSignInScreen.tsx',
    chromePolicy: 'auth-hidden',
    certification: 'pending-device-comparison',
  },
  {
    ref: 5,
    image: 'image5.jpeg',
    state: 'Customer Home - Empty Cart Reference State',
    screenPath: 'src/features/home/screens/CustomerHomeScreen.tsx',
    chromePolicy: 'customer-shell',
    certification: 'pending-device-comparison',
  },
  {
    ref: 6,
    image: 'image6.jpeg',
    state: 'Customer Home - Active Cart Reference State',
    screenPath: 'src/features/home/screens/CustomerHomeScreen.tsx',
    chromePolicy: 'customer-shell',
    certification: 'pending-device-comparison',
  },
  {
    ref: 7,
    image: 'image7.jpeg',
    state: 'Discover Home Chefs - Empty Cart Reference State',
    screenPath: 'src/features/chefDiscovery/screens/DiscoverHomeChefsScreen.tsx',
    chromePolicy: 'customer-shell',
    certification: 'pending-device-comparison',
  },
  {
    ref: 8,
    image: 'image8.jpeg',
    state: 'Discover Home Chefs - Active Cart Reference State',
    screenPath: 'src/features/chefDiscovery/screens/DiscoverHomeChefsScreen.tsx',
    chromePolicy: 'customer-shell',
    certification: 'pending-device-comparison',
  },
  {
    ref: 9,
    image: 'image9.jpeg',
    state: 'My Orders - Empty Cart Reference State',
    screenPath: 'src/features/customerOrders/screens/CustomerOrdersScreen.tsx',
    chromePolicy: 'customer-shell',
    certification: 'pending-device-comparison',
  },
  {
    ref: 10,
    image: 'image10.jpeg',
    state: 'My Orders - Active Cart Reference State',
    screenPath: 'src/features/customerOrders/screens/CustomerOrdersScreen.tsx',
    chromePolicy: 'customer-shell',
    certification: 'pending-device-comparison',
  },
  {
    ref: 11,
    image: 'image11.jpeg',
    state: 'Customer Profile - Empty Cart Reference State',
    screenPath: 'src/features/customerProfile/screens/CustomerProfileScreen.tsx',
    chromePolicy: 'customer-shell',
    certification: 'pending-device-comparison',
  },
  {
    ref: 12,
    image: 'image12.jpeg',
    state: 'Customer Profile - Active Cart Reference State',
    screenPath: 'src/features/customerProfile/screens/CustomerProfileScreen.tsx',
    chromePolicy: 'customer-shell',
    certification: 'pending-device-comparison',
  },
  {
    ref: 13,
    image: 'image13.jpeg',
    state: 'Dish Detail',
    screenPath: 'src/features/dishDetail/screens/CustomerDishDetailScreen.tsx',
    chromePolicy: 'focused',
    certification: 'pending-device-comparison',
  },
  {
    ref: 14,
    image: 'image14.jpeg',
    state: 'Dish Ingredients',
    screenPath: 'src/features/dishDetail/screens/CustomerDishIngredientsScreen.tsx',
    chromePolicy: 'focused',
    certification: 'pending-device-comparison',
  },
  {
    ref: 15,
    image: 'image15.jpeg',
    state: 'Customer Kitchen Profile',
    screenPath: 'src/features/kitchenProfile/screens/CustomerKitchenProfileScreen.tsx',
    chromePolicy: 'focused',
    certification: 'pending-device-comparison',
  },
  {
    ref: 16,
    image: 'image16.jpeg',
    state: 'Customer Kitchen All Dishes',
    screenPath: 'src/features/kitchenProfile/screens/CustomerKitchenDishesScreen.tsx',
    chromePolicy: 'focused',
    certification: 'pending-device-comparison',
  },
  {
    ref: 17,
    image: 'image17.jpeg',
    state: 'Customer Filter and Sort',
    screenPath: 'src/features/discoveryFilters/screens/CustomerFilterSortScreen.tsx',
    chromePolicy: 'focused',
    certification: 'pending-device-comparison',
  },
  {
    ref: 18,
    image: 'image18.jpeg',
    state: 'Customer Cart',
    screenPath: 'src/features/cart/screens/CustomerCartScreen.tsx',
    chromePolicy: 'focused',
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

describe('P124 customer visual QA target preflight', () => {
  it('covers exactly refs 1, 3 and 5 through 18', () => {
    expect(CUSTOMER_VISUAL_QA_TARGETS.map(target => target.ref)).toEqual([
      1, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
    ]);
  });

  it('locks each reference to the reviewed current customer implementation module', () => {
    expect(
      CUSTOMER_VISUAL_QA_TARGETS.map(target => [target.ref, target.screenPath]),
    ).toEqual([
      [1, 'src/features/auth/screens/PhoneSignInScreen.tsx'],
      [3, 'src/features/auth/screens/EmailSignInScreen.tsx'],
      [5, 'src/features/home/screens/CustomerHomeScreen.tsx'],
      [6, 'src/features/home/screens/CustomerHomeScreen.tsx'],
      [7, 'src/features/chefDiscovery/screens/DiscoverHomeChefsScreen.tsx'],
      [8, 'src/features/chefDiscovery/screens/DiscoverHomeChefsScreen.tsx'],
      [9, 'src/features/customerOrders/screens/CustomerOrdersScreen.tsx'],
      [10, 'src/features/customerOrders/screens/CustomerOrdersScreen.tsx'],
      [11, 'src/features/customerProfile/screens/CustomerProfileScreen.tsx'],
      [12, 'src/features/customerProfile/screens/CustomerProfileScreen.tsx'],
      [13, 'src/features/dishDetail/screens/CustomerDishDetailScreen.tsx'],
      [14, 'src/features/dishDetail/screens/CustomerDishIngredientsScreen.tsx'],
      [15, 'src/features/kitchenProfile/screens/CustomerKitchenProfileScreen.tsx'],
      [16, 'src/features/kitchenProfile/screens/CustomerKitchenDishesScreen.tsx'],
      [17, 'src/features/discoveryFilters/screens/CustomerFilterSortScreen.tsx'],
      [18, 'src/features/cart/screens/CustomerCartScreen.tsx'],
    ]);
  });

  it('keeps empty/active cart reference pairs on the same implementation', () => {
    const pairs = [
      [5, 6],
      [7, 8],
      [9, 10],
      [11, 12],
    ] as const;

    for (const [emptyRef, activeRef] of pairs) {
      const emptyTarget = CUSTOMER_VISUAL_QA_TARGETS.find(
        target => target.ref === emptyRef,
      );
      const activeTarget = CUSTOMER_VISUAL_QA_TARGETS.find(
        target => target.ref === activeRef,
      );

      expect(emptyTarget?.screenPath).toBe(activeTarget?.screenPath);
      expect(emptyTarget?.state).toContain('Empty Cart');
      expect(activeTarget?.state).toContain('Active Cart');
    }
  });

  it('keeps customer authentication references free of authenticated chrome', () => {
    const authTargets = CUSTOMER_VISUAL_QA_TARGETS.filter(target =>
      [1, 3].includes(target.ref),
    );

    expect(authTargets).toHaveLength(2);
    expect(authTargets.every(target => target.chromePolicy === 'auth-hidden')).toBe(
      true,
    );
  });

  it('does not convert preflight coverage into a false visual pass', () => {
    expect(
      CUSTOMER_VISUAL_QA_TARGETS.every(
        target => target.certification === 'pending-device-comparison',
      ),
    ).toBe(true);
  });

  it('locks the P124 comparison dimensions from phases.md', () => {
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
