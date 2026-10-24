import type {CustomerProfileIdentity} from './domain/customerProfileContract';
import {
  CUSTOMER_PROFILE_MENU_ROWS,
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
  it('keeps rows deterministic and maps each row to the registered action', () => {
    expect(CUSTOMER_PROFILE_MENU_ROWS.map(row => row.id)).toEqual([
      'favorites',
      'meal-plans',
      'payments',
      'referral',
      'contact',
      'switch-chef',
      'logout',
    ]);

    expect(
      CUSTOMER_PROFILE_MENU_ROWS.map(row => [row.id, row.action]),
    ).toEqual([
      ['favorites', 'route-favorites'],
      ['meal-plans', 'route-meal-plans'],
      ['payments', 'route-payments'],
      ['referral', 'route-referral'],
      ['contact', 'route-support'],
      ['switch-chef', 'switch-chef'],
      ['logout', 'logout'],
    ]);

    const favorites = CUSTOMER_PROFILE_MENU_ROWS.find(row => row.id === 'favorites');
    expect(favorites?.icon).toBe('heart');
    expect(favorites?.title).toBe('Saved');

    const payments = CUSTOMER_PROFILE_MENU_ROWS.find(row => row.id === 'payments');
    expect(payments?.icon).toBe('wallet');

    const contact = CUSTOMER_PROFILE_MENU_ROWS.find(row => row.id === 'contact');
    expect(contact?.icon).toBe('headset');
  });

  it('derives display identity only from approved profile fields', () => {
    const full = profile();
    expect(resolveCustomerProfileDisplayName(full)).toBe('Asha Rao');
    expect(resolveCustomerProfileInitials(full)).toBe('AR');
    expect(resolveCustomerProfilePhoneLabel(full)).toBe(
      'Phone •••• 3210',
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
    expect(resolveCustomerProfilePhoneLabel(partial)).toBe('No phone number on your account');
  });
});
