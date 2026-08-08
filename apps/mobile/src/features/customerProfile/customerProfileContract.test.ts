import {
  CUSTOMER_PROFILE_CAPABILITY_UNSUPPORTED_REASON,
  parseCustomerProfileHubContract,
} from './domain/customerProfileContract';
import {
  emptyCustomerProfileFixture,
  fullCustomerProfileFixture,
  partialCustomerProfileFixture,
  unsupportedCustomerProfileFixture,
} from './fixtures/customerProfileFixtures';

function profile(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    identityId: '22222222-2222-4222-8222-222222222222',
    registeredPhoneNumber: '+919876543210',
    firstName: 'Asha',
    lastName: 'Rao',
    email: 'asha@example.test',
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-08T10:00:00Z',
    ...overrides,
  };
}

describe('P57 customer profile/rewards contract', () => {
  it('maps the approved profile fields and preserves registered-phone readiness', () => {
    const result = parseCustomerProfileHubContract(profile());

    expect(result).not.toBeNull();
    expect(result?.profile).toMatchObject({
      profileId: '11111111-1111-4111-8111-111111111111',
      identityId: '22222222-2222-4222-8222-222222222222',
      displayName: 'Asha Rao',
      email: 'asha@example.test',
      completeness: 'full',
      registeredPhone: {
        registeredPhoneNumber: '+919876543210',
        last4: '3210',
        isRegistered: true,
        source: 'server-registered-phone',
      },
    });
  });

  it('keeps missing profile details explicit instead of inventing fallback identity data', () => {
    const result = parseCustomerProfileHubContract(
      profile({
        registeredPhoneNumber: null,
        lastName: null,
        email: null,
      }),
    );

    expect(result?.profile).toMatchObject({
      lastName: null,
      displayName: 'Asha',
      email: null,
      completeness: 'partial',
      registeredPhone: {
        registeredPhoneNumber: null,
        last4: null,
        isRegistered: false,
      },
    });
  });

  it('marks rewards, order counters, notifications, and chef role as unsupported', () => {
    const result = parseCustomerProfileHubContract(profile());

    expect(result?.rewards).toEqual({
      availability: 'unsupported',
      balance: null,
      tier: null,
      history: {
        availability: 'unsupported',
        entries: [],
        reason: CUSTOMER_PROFILE_CAPABILITY_UNSUPPORTED_REASON,
      },
      reason: CUSTOMER_PROFILE_CAPABILITY_UNSUPPORTED_REASON,
    });
    expect(result?.orderSummary).toEqual({
      availability: 'unsupported',
      counters: [],
      reason: CUSTOMER_PROFILE_CAPABILITY_UNSUPPORTED_REASON,
    });
    expect(result?.notifications.unreadCount).toBeNull();
    expect(result?.chefRole.chefStatus).toBeNull();
  });

  it('rejects responses missing server-owned identity metadata', () => {
    expect(parseCustomerProfileHubContract(profile({identityId: null}))).toBeNull();
  });

  it('provides full, partial, empty, and unsupported fixtures for P58', () => {
    expect(fullCustomerProfileFixture.status).toBe('ready');
    if (fullCustomerProfileFixture.status === 'ready') {
      expect(fullCustomerProfileFixture.data.profile.completeness).toBe('full');
    }

    expect(partialCustomerProfileFixture.status).toBe('ready');
    if (partialCustomerProfileFixture.status === 'ready') {
      expect(partialCustomerProfileFixture.data.profile.completeness).toBe(
        'partial',
      );
    }

    expect(emptyCustomerProfileFixture.status).toBe('empty');
    expect(unsupportedCustomerProfileFixture.status).toBe('unsupported');
  });
});
