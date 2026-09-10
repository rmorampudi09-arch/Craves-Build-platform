import {
  createCustomerProfileEmptyState,
  createCustomerProfileReadyState,
  createCustomerProfileUnsupportedState,
  parseCustomerProfileHubContract,
  type CustomerProfileHubState,
} from '../domain/customerProfileContract';

function readyFixture(raw: Record<string, unknown>): CustomerProfileHubState {
  const profile = parseCustomerProfileHubContract(raw);
  if (!profile) {
    throw new Error('Invalid customer profile fixture.');
  }
  return createCustomerProfileReadyState(profile);
}

export const fullCustomerProfileFixture = readyFixture({
  id: '11111111-1111-4111-8111-111111111111',
  identityId: '22222222-2222-4222-8222-222222222222',
  registeredPhoneNumber: '+919876543210',
  firstName: 'Asha',
  lastName: 'Rao',
  email: 'asha@example.test',
  createdAt: '2026-08-01T10:00:00Z',
  updatedAt: '2026-08-08T10:00:00Z',
});

export const partialCustomerProfileFixture = readyFixture({
  id: '33333333-3333-4333-8333-333333333333',
  identityId: '44444444-4444-4444-8444-444444444444',
  registeredPhoneNumber: null,
  firstName: 'Asha',
  lastName: null,
  email: null,
  createdAt: '2026-08-01T10:00:00Z',
  updatedAt: '2026-08-08T10:00:00Z',
});

export const emptyCustomerProfileFixture = createCustomerProfileEmptyState();

export const unsupportedCustomerProfileFixture =
  createCustomerProfileUnsupportedState();
