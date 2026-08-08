import type {CustomerProfileIdentity} from './domain/customerProfileContract';
import {
  CUSTOMER_PROFILE_MENU_ROWS,
  CUSTOMER_PROFILE_ORDER_COUNTS_UNSUPPORTED_COPY,
  CUSTOMER_PROFILE_REWARDS_UNSUPPORTED_COPY,
  resolveCustomerProfileDisplayName,
  resolveCustomerProfileInitials,
  resolveCustomerProfilePhoneLabel,
} from './presentation/customerProfileUiModel';

function profile(
  overrides: Partial<CustomerProfileIdentity> = {},
): CustomerProfileIdentity {
  return {
    profileId: '11111111-1111-4111-8111-111111111111',
    identityId: '22222222-2222-4222-8222-222222222222',
    firstName: 'Asha',
    lastName: 'Rao',
    displayName: 'Asha Rao',
    email: 'asha@example.com',
    registeredPhone: {
      registeredPhoneNumber: '+919876543210',
      last4: '3210',
      isRegistered: true,
      source: 'server-registered-phone',
    },
    createdAt: '2026-08-08T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z',
    completeness: 'full',
    ...overrides,
  };
}

describe('customerProfileUiModel', () => {
  it('keeps rows deterministic, routes registered destinations, and blocks only later routes', () => {
    expect(CUSTOMER_PROFILE_MENU_ROWS.map(row => row.id)).toEqual([
      'favorites',
      'payments',
      'orders',
      'contact',
      'logout',
    ]);

    const favorites = CUSTOMER_PROFILE_MENU_ROWS.find(row => row.id === 'favorites');
    expect(favorites?.action).toBe('route-favorites');
    expect(favorites?.icon).toBe('heart');

    const payments = CUSTOMER_PROFILE_MENU_ROWS.find(row => row.id === 'payments');
    expect(payments?.action).toBe('route-payments');
    expect(payments?.icon).toBe('shield');

    const orders = CUSTOMER_PROFILE_MENU_ROWS.find(row => row.id === 'orders');
    expect(orders?.action).toBe('route-orders');

    const logout = CUSTOMER_PROFILE_MENU_ROWS.find(row => row.id === 'logout');
    expect(logout?.action).toBe('logout');

    const blocked = CUSTOMER_PROFILE_MENU_ROWS.filter(
      row => row.action === 'contract-blocker',
    );
    expect(blocked).toHaveLength(1);
    expect(blocked.map(row => row.id)).toEqual(['contact']);
    expect(blocked.every(row => Boolean(row.blockerMessage))).toBe(true);
  });

  it('derives display identity only from approved profile fields', () => {
    const full = profile();
    expect(resolveCustomerProfileDisplayName(full)).toBe('Asha Rao');
    expect(resolveCustomerProfileInitials(full)).toBe('AR');
    expect(resolveCustomerProfilePhoneLabel(full)).toBe(
      'Registered phone •••• 3210',
    );

    const partial = profile({
      firstName: null,
      lastName: null,
      displayName: null,
      registeredPhone: {
        registeredPhoneNumber: null,
        last4: null,
        isRegistered: false,
        source: 'server-registered-phone',
      },
      completeness: 'partial',
    });
    expect(resolveCustomerProfileDisplayName(partial)).toBe('asha@example.com');
    expect(resolveCustomerProfileInitials(partial)).toBe('AS');
    expect(resolveCustomerProfilePhoneLabel(partial)).toContain('No registered phone');
  });

  it('uses truthful unsupported copy instead of fabricated rewards or order counts', () => {
    expect(CUSTOMER_PROFILE_REWARDS_UNSUPPORTED_COPY).toContain(
      'not exposed by the approved profile contract',
    );
    expect(CUSTOMER_PROFILE_ORDER_COUNTS_UNSUPPORTED_COPY).toContain(
      'not exposed by the approved profile contract',
    );
  });
});
