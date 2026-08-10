type CustomerVisualQaAvailability =
  | 'implemented'
  | 'partial-capability'
  | 'blocked-contract'
  | 'blocked-provider';

type CustomerVisualQaTarget = {
  ref: number;
  image: string;
  state: string;
  screenPath: string | null;
  chromePolicy: 'customer-shell' | 'focused' | 'multi-host';
  availability: CustomerVisualQaAvailability;
  certification: 'pending-device-comparison';
};

const CUSTOMER_VISUAL_QA_TARGETS: readonly CustomerVisualQaTarget[] = [
  {
    ref: 19,
    image: 'image19.jpeg',
    state: 'Favorites - Empty Cart Reference State',
    screenPath: 'src/features/favorites/screens/CustomerFavoritesScreen.tsx',
    chromePolicy: 'customer-shell',
    availability: 'partial-capability',
    certification: 'pending-device-comparison',
  },
  {
    ref: 20,
    image: 'image20.jpeg',
    state: 'Favorites - Active Cart Reference State',
    screenPath: 'src/features/favorites/screens/CustomerFavoritesScreen.tsx',
    chromePolicy: 'customer-shell',
    availability: 'partial-capability',
    certification: 'pending-device-comparison',
  },
  {
    ref: 21,
    image: 'image21.jpeg',
    state: 'Notifications - Empty Cart Reference State',
    screenPath: 'src/features/notifications/screens/CustomerNotificationsScreen.tsx',
    chromePolicy: 'customer-shell',
    availability: 'partial-capability',
    certification: 'pending-device-comparison',
  },
  {
    ref: 22,
    image: 'image22.jpeg',
    state: 'Notifications - Active Cart Reference State',
    screenPath: 'src/features/notifications/screens/CustomerNotificationsScreen.tsx',
    chromePolicy: 'customer-shell',
    availability: 'partial-capability',
    certification: 'pending-device-comparison',
  },
  {
    ref: 23,
    image: 'image23.jpeg',
    state: 'Edit Customer Profile - Active Cart Reference State',
    screenPath:
      'src/features/customerProfile/screens/CustomerProfileEditRouteScreen.tsx',
    chromePolicy: 'focused',
    availability: 'partial-capability',
    certification: 'pending-device-comparison',
  },
  {
    ref: 24,
    image: 'image24.jpeg',
    state: 'Edit Customer Profile - Empty Cart Reference State',
    screenPath:
      'src/features/customerProfile/screens/CustomerProfileEditRouteScreen.tsx',
    chromePolicy: 'focused',
    availability: 'partial-capability',
    certification: 'pending-device-comparison',
  },
  {
    ref: 25,
    image: 'image25.jpeg',
    state: 'My Addresses - Empty Cart Reference State',
    screenPath:
      'src/features/customerAddresses/screens/CustomerAddressesRouteScreen.tsx',
    chromePolicy: 'customer-shell',
    availability: 'partial-capability',
    certification: 'pending-device-comparison',
  },
  {
    ref: 26,
    image: 'image26.jpeg',
    state: 'My Addresses - Active Cart Reference State',
    screenPath:
      'src/features/customerAddresses/screens/CustomerAddressesRouteScreen.tsx',
    chromePolicy: 'customer-shell',
    availability: 'partial-capability',
    certification: 'pending-device-comparison',
  },
  {
    ref: 27,
    image: 'image27.jpeg',
    state: 'Add New Address - Empty Cart Reference State',
    screenPath:
      'src/features/customerAddresses/screens/CustomerAddressEditorModal.tsx',
    chromePolicy: 'focused',
    availability: 'partial-capability',
    certification: 'pending-device-comparison',
  },
  {
    ref: 28,
    image: 'image28.jpeg',
    state: 'Payment Methods - Empty Cart Reference State',
    screenPath:
      'src/features/payment/screens/CustomerPaymentMethodsRouteScreen.tsx',
    chromePolicy: 'customer-shell',
    availability: 'partial-capability',
    certification: 'pending-device-comparison',
  },
  {
    ref: 29,
    image: 'image29.jpeg',
    state: 'Payment Methods - Active Cart Reference State',
    screenPath:
      'src/features/payment/screens/CustomerPaymentMethodsRouteScreen.tsx',
    chromePolicy: 'customer-shell',
    availability: 'partial-capability',
    certification: 'pending-device-comparison',
  },
  {
    ref: 30,
    image: 'image30.jpeg',
    state: 'Add New Card - Empty Cart Reference State',
    screenPath: null,
    chromePolicy: 'focused',
    availability: 'blocked-provider',
    certification: 'pending-device-comparison',
  },
  {
    ref: 31,
    image: 'image31.jpeg',
    state: 'My Coupons - Empty Cart Reference State',
    screenPath: null,
    chromePolicy: 'customer-shell',
    availability: 'blocked-contract',
    certification: 'pending-device-comparison',
  },
  {
    ref: 32,
    image: 'image32.jpeg',
    state: 'My Coupons - Active Cart Reference State',
    screenPath: null,
    chromePolicy: 'customer-shell',
    availability: 'blocked-contract',
    certification: 'pending-device-comparison',
  },
  {
    ref: 33,
    image: 'image33.jpeg',
    state: 'My Reviews - Empty Cart Reference State',
    screenPath: null,
    chromePolicy: 'customer-shell',
    availability: 'blocked-contract',
    certification: 'pending-device-comparison',
  },
  {
    ref: 34,
    image: 'image34.jpeg',
    state: 'My Reviews - Active Cart Reference State',
    screenPath: null,
    chromePolicy: 'customer-shell',
    availability: 'blocked-contract',
    certification: 'pending-device-comparison',
  },
  {
    ref: 35,
    image: 'image35.jpeg',
    state: 'Settings - Empty Cart Reference State',
    screenPath:
      'src/features/customerSettings/screens/CustomerSettingsRouteScreen.tsx',
    chromePolicy: 'focused',
    availability: 'implemented',
    certification: 'pending-device-comparison',
  },
  {
    ref: 36,
    image: 'image36.jpeg',
    state: 'Settings - Active Cart Reference State',
    screenPath:
      'src/features/customerSettings/screens/CustomerSettingsRouteScreen.tsx',
    chromePolicy: 'focused',
    availability: 'implemented',
    certification: 'pending-device-comparison',
  },
  {
    ref: 37,
    image: 'image37.jpeg',
    state: 'Customer Empty, Search, Offline, and No-Data States Collection',
    screenPath:
      'src/features/customerEmptyStates/components/CustomerEmptyState.tsx',
    chromePolicy: 'multi-host',
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

const REF_37_REQUIRED_STATES = [
  'empty cart',
  'no orders',
  'no search results',
  'no favorites',
  'no internet',
  'no saved addresses',
  'no reviews',
  'no coupons',
] as const;

const CART_VARIANT_PAIRS = [
  [19, 20],
  [21, 22],
  [24, 23],
  [25, 26],
  [28, 29],
  [31, 32],
  [33, 34],
  [35, 36],
] as const;

describe('P125 customer visual QA target preflight', () => {
  it('covers exactly refs 19 through 37', () => {
    expect(CUSTOMER_VISUAL_QA_TARGETS.map(target => target.ref)).toEqual([
      19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35,
      36, 37,
    ]);
  });

  it('keeps every active/empty cart pair on one implementation boundary', () => {
    for (const [emptyRef, activeRef] of CART_VARIANT_PAIRS) {
      const emptyTarget = CUSTOMER_VISUAL_QA_TARGETS.find(
        target => target.ref === emptyRef,
      );
      const activeTarget = CUSTOMER_VISUAL_QA_TARGETS.find(
        target => target.ref === activeRef,
      );

      expect(emptyTarget?.screenPath).toBe(activeTarget?.screenPath);
      expect(emptyTarget?.availability).toBe(activeTarget?.availability);
      expect(emptyTarget?.state).toContain('Empty Cart');
      expect(activeTarget?.state).toContain('Active Cart');
    }
  });

  it('does not invent production modules for contract/provider-blocked references', () => {
    const blockedRefs = [30, 31, 32, 33, 34];
    const blockedTargets = CUSTOMER_VISUAL_QA_TARGETS.filter(target =>
      blockedRefs.includes(target.ref),
    );

    expect(blockedTargets).toHaveLength(blockedRefs.length);
    expect(blockedTargets.every(target => target.screenPath === null)).toBe(true);
    expect(
      blockedTargets.every(target => target.availability.startsWith('blocked-')),
    ).toBe(true);
  });

  it('keeps all implemented or partially implemented refs bound to real modules', () => {
    const availableTargets = CUSTOMER_VISUAL_QA_TARGETS.filter(
      target => !target.availability.startsWith('blocked-'),
    );

    expect(availableTargets.every(target => target.screenPath !== null)).toBe(true);
  });

  it('locks all eight reference-37 lifecycle states', () => {
    expect(REF_37_REQUIRED_STATES).toEqual([
      'empty cart',
      'no orders',
      'no search results',
      'no favorites',
      'no internet',
      'no saved addresses',
      'no reviews',
      'no coupons',
    ]);
  });

  it('does not convert deterministic preflight into a false visual certification', () => {
    expect(
      CUSTOMER_VISUAL_QA_TARGETS.every(
        target => target.certification === 'pending-device-comparison',
      ),
    ).toBe(true);
  });

  it('locks the P125 comparison dimensions inherited from the visual QA gate', () => {
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
