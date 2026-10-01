import {
  applyDetectedCustomerAddress,
  createCustomerAddressDraft,
  createCustomerAddressSavePlan,
  findDuplicateCustomerAddress,
  isCustomerAddressDraftDirty,
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
  districtName: 'Bengaluru Urban',
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
    districtName: 'Bengaluru Urban',
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560034',
    latitude: 12.9352,
    longitude: 77.6245,
  };
}

describe('customer address editor domain', () => {
  it('saves Other directly in addressLabel and restores it when editing', () => {
    const draft = {...validNewDraft(), addressCategory: 'OTHER' as const, customLabel: "  Mom's House  "};
    const plan = createCustomerAddressSavePlan(draft, [], null);
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') throw new Error('Expected a valid save');
    expect(plan.request.addressLabel).toBe("Mom's House");
    expect(plan.request).not.toHaveProperty('addressName');
    expect(plan.request).not.toHaveProperty('addressCategory');
    expect(plan.request).not.toHaveProperty('customLabel');
    expect(createCustomerAddressDraft({...savedAddress, addressLabel: plan.request.addressLabel})).toMatchObject({addressCategory: 'OTHER', customLabel: "Mom's House"});
    expect(isCustomerAddressDraftDirty({...draft, customLabel: 'Office annex'}, draft)).toBe(true);
  });

  it.each(['', '  ', 'HOME', 'WORK', 'x'.repeat(81)])('blocks invalid Other name %s before saving', customLabel => {
    const plan = createCustomerAddressSavePlan({...validNewDraft(), addressCategory: 'OTHER', customLabel}, [], null);
    expect(plan.status).toBe('invalid');
    if (plan.status !== 'invalid') throw new Error('Expected validation failure');
    expect(plan.fieldErrors.customLabel).toBeTruthy();
  });

  it('accepts 80 characters and keeps custom text while switching categories', () => {
    const draft = {...validNewDraft(), addressCategory: 'OTHER' as const, customLabel: 'x'.repeat(80)};
    const other = createCustomerAddressSavePlan(draft, [], null);
    expect(other.status === 'ready' && other.request.addressLabel).toBe(draft.customLabel);
    const work = createCustomerAddressSavePlan({...draft, addressCategory: 'WORK'}, [], null);
    expect(work.status === 'ready' && work.request.addressLabel).toBe('WORK');
    expect(createCustomerAddressDraft({...savedAddress, addressLabel: 'OTHER'})).toMatchObject({addressCategory: 'OTHER', customLabel: 'Other'});
  });
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

  it('maps a resolved current location into editable written fields', () => {
    const draft = applyDetectedCustomerAddress(createCustomerAddressDraft(), {
      formattedAddress: '12 Lake Road, Indiranagar, Bengaluru',
      houseNumber: '12',
      street: 'Lake Road',
      area: 'Indiranagar',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560038',
      latitude: 12.9784,
      longitude: 77.6408,
    });

    expect(draft).toMatchObject({
      addressLine1: '12, Lake Road',
      areaName: 'Indiranagar',
      districtName: 'Bengaluru Urban',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560038',
      latitude: 12.9784,
      longitude: 77.6408,
    });
  });

  it('builds the approved full PUT request for a valid edit', () => {
    const plan = createCustomerAddressSavePlan(
      {...createCustomerAddressDraft(savedAddress), addressLine1: '14 Lake Road'},
      [savedAddress],
      savedAddress.id,
    );

    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    expect(plan.request).toMatchObject({
      addressLine1: '14 Lake Road',
      districtName: 'Bengaluru Urban',
      postalCode: '560038',
      latitude: 12.9784,
      longitude: 77.6408,
      isDefault: true,
    });
  });

  it('builds the approved POST request for a mapped new address', () => {
    const plan = createCustomerAddressSavePlan(validNewDraft(), [], null);
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    expect(plan.request).toMatchObject({
      addressLabel: 'HOME',
      districtName: 'Bengaluru Urban',
      latitude: 12.9352,
      longitude: 77.6245,
      isDefault: false,
    });
  });

  it('requires a mapped delivery point before saving a manual address', () => {
    const plan = createCustomerAddressSavePlan(
      {...validNewDraft(), latitude: null, longitude: null},
      [],
      null,
    );
    expect(plan.status).toBe('invalid');
    if (plan.status !== 'invalid') return;
    expect(plan.formError).toContain('Use current location');
  });

  it('blocks a duplicate before saving', () => {
    const duplicateDraft = {
      ...validNewDraft(),
      addressLine1: savedAddress.addressLine1,
      areaName: savedAddress.areaName ?? '',
      city: savedAddress.city,
      state: savedAddress.state,
      postalCode: savedAddress.postalCode ?? '',
    };
    const plan = createCustomerAddressSavePlan(
      duplicateDraft,
      [savedAddress],
      null,
    );
    expect(plan.status).toBe('invalid');
    if (plan.status !== 'invalid') return;
    expect(plan.formError).toBe('This delivery address is already saved.');
  });
});
