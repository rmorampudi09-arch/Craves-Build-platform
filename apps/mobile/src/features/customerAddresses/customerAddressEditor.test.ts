import {
  CUSTOMER_ADDRESS_CREATE_CONTRACT_BLOCKER,
  applyCustomerAddressDefaultRule,
  createCustomerAddressDraft,
  createCustomerAddressSavePlan,
  findDuplicateCustomerAddress,
  validateCustomerAddressDraft,
} from './domain/customerAddressEditor';
import type {CustomerAddress} from './domain/customerAddressContract';

const savedAddress: CustomerAddress = {
  id: '11111111-1111-4111-8111-111111111111',
  identityId: '22222222-2222-4222-8222-222222222222',
  addressLabel: 'HOME',
  recipientName: 'Asha Rao',
  contactPhoneNumber: '+919876543210',
  addressLine1: '12 Lake Road',
  addressLine2: 'Floor 2',
  landmark: null,
  areaName: 'Indiranagar',
  city: 'Bengaluru',
  state: 'Karnataka',
  postalCode: '560038',
  latitude: 12.9784,
  longitude: 77.6408,
  isDefault: true,
  active: true,
  createdAt: '2026-08-01T10:00:00Z',
  updatedAt: '2026-08-02T10:00:00Z',
};

function validNewDraft() {
  return {
    ...createCustomerAddressDraft(),
    recipientName: 'Ravi Kumar',
    contactPhoneNumber: '+919000000000',
    addressLine1: '44 Market Street',
    areaName: 'Koramangala',
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560034',
  };
}

describe('P67 partial address editor domain', () => {
  it('returns a controlled error for an invalid pincode', () => {
    const draft = {...validNewDraft(), postalCode: '56003'};

    expect(validateCustomerAddressDraft(draft).postalCode).toBe(
      'Enter a valid 6-digit pincode.',
    );
  });

  it('detects semantic duplicate addresses while ignoring the address being edited', () => {
    const draft = createCustomerAddressDraft(savedAddress);

    expect(findDuplicateCustomerAddress(draft, [savedAddress], null)?.id).toBe(
      savedAddress.id,
    );
    expect(
      findDuplicateCustomerAddress(draft, [savedAddress], savedAddress.id),
    ).toBeNull();
  });

  it('forces the first address to remain default', () => {
    const draft = validNewDraft();

    expect(applyCustomerAddressDefaultRule(draft, [], null).isDefault).toBe(
      true,
    );
  });

  it('does not allow the current default address to be unset during edit', () => {
    const draft = {...createCustomerAddressDraft(savedAddress), isDefault: false};

    expect(
      applyCustomerAddressDefaultRule(
        draft,
        [savedAddress],
        savedAddress.id,
      ).isDefault,
    ).toBe(true);
  });

  it('builds the already-approved full PUT request for a valid edit', () => {
    const draft = {
      ...createCustomerAddressDraft(savedAddress),
      addressLine1: '14 Lake Road',
    };

    const plan = createCustomerAddressSavePlan(
      draft,
      [savedAddress],
      savedAddress.id,
    );

    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') {
      return;
    }
    expect(plan.request).toMatchObject({
      addressLine1: '14 Lake Road',
      postalCode: '560038',
      latitude: 12.9784,
      longitude: 77.6408,
      isDefault: true,
    });
  });

  it('keeps a valid manual add flow blocked instead of inventing a POST contract', () => {
    const plan = createCustomerAddressSavePlan(validNewDraft(), [], null);

    expect(plan.status).toBe('blocked');
    if (plan.status !== 'blocked') {
      return;
    }
    expect(plan.blocker).toBe(CUSTOMER_ADDRESS_CREATE_CONTRACT_BLOCKER);
  });

  it('blocks a duplicate before reaching the deferred create contract', () => {
    const duplicateDraft = {
      ...validNewDraft(),
      addressLine1: savedAddress.addressLine1,
      areaName: savedAddress.areaName,
      city: savedAddress.city,
      state: savedAddress.state,
      postalCode: savedAddress.postalCode,
    };
    const plan = createCustomerAddressSavePlan(
      duplicateDraft,
      [savedAddress],
      null,
    );

    expect(plan.status).toBe('invalid');
    if (plan.status !== 'invalid') {
      return;
    }
    expect(plan.formError).toBe('This delivery address is already saved.');
  });
});
