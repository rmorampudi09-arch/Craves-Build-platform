export type ChefCrossScreenReconciliationMode =
  | 'shared-authoritative-cache'
  | 'revalidate-after-write'
  | 'blocked';

export type ChefCrossScreenReconciliationArea =
  | 'orderCountsAndStatus'
  | 'notifications'
  | 'activeCards'
  | 'payoutBalance'
  | 'menuAvailability'
  | 'analyticsTotals'
  | 'identityVerification';

export interface ChefCrossScreenReconciliationEntry {
  mode: ChefCrossScreenReconciliationMode;
  sourceOfTruth: string;
  surfaces: readonly string[];
  blocker: string | null;
}

/**
 * P109 audit contract. This is intentionally limited to capabilities that are
 * present in the approved mobile/backend boundary. Missing payout/analytics
 * contracts remain explicit blockers instead of being approximated locally.
 */
export const CHEF_CROSS_SCREEN_RECONCILIATION_AUDIT = {
  orderCountsAndStatus: {
    mode: 'shared-authoritative-cache',
    sourceOfTruth: 'chef-operational-orders plus authoritative order-detail responses',
    surfaces: ['Chef Dashboard counters', 'Chef Orders tabs'],
    blocker: null,
  },
  notifications: {
    mode: 'shared-authoritative-cache',
    sourceOfTruth: 'chef-notifications',
    surfaces: ['Chef header badge', 'Chef Dashboard notifications'],
    blocker: null,
  },
  activeCards: {
    mode: 'shared-authoritative-cache',
    sourceOfTruth: 'chef-operational-orders',
    surfaces: ['Chef Dashboard active orders', 'Chef Orders lifecycle views'],
    blocker: null,
  },
  payoutBalance: {
    mode: 'blocked',
    sourceOfTruth: 'none approved for mobile',
    surfaces: ['Chef Dashboard earnings area', 'Chef Payout History'],
    blocker:
      'The approved boundary exposes an earning ledger only; wallet balance, payout transactions, eligibility and initiation are not available.',
  },
  menuAvailability: {
    mode: 'shared-authoritative-cache',
    sourceOfTruth: 'chef-menu-items',
    surfaces: ['Chef Menu', 'Chef Dashboard menu summary'],
    blocker: null,
  },
  analyticsTotals: {
    mode: 'blocked',
    sourceOfTruth: 'none approved for mobile',
    surfaces: ['Chef Analytics', 'Chef Dashboard analytics area'],
    blocker:
      'No approved Chef analytics aggregate/date-range contract exists; existing order, earning and menu reads must not be relabeled as analytics totals.',
  },
  identityVerification: {
    mode: 'revalidate-after-write',
    sourceOfTruth: 'chef-profile-kitchen plus chef-business-information',
    surfaces: ['Chef Profile', 'Chef Edit Profile', 'Chef Business Information'],
    blocker: null,
  },
} as const satisfies Record<
  ChefCrossScreenReconciliationArea,
  ChefCrossScreenReconciliationEntry
>;
