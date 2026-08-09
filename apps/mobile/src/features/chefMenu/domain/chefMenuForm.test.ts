import type {ChefMenuItem} from '../api/chefMenuApi';
import {
  EMPTY_CHEF_MENU_FORM,
  buildChefMenuItemRequest,
  buildChefMenuReplacementRequest,
  chefMenuFormSchema,
  chefMenuItemToFormValues,
  type ChefMenuFormValues,
} from './chefMenuForm';

const validForm: ChefMenuFormValues = {
  itemName: 'Paneer Tikka',
  description: '  Charred paneer with peppers.  ',
  category: '  Starters  ',
  foodType: 'VEG',
  price: '249.50',
  servesCount: '2',
  preparationTimeMinutes: '35',
  spiceLevel: 'MEDIUM',
  unitPackageWeightGrams: '450',
  thermoboxRequired: true,
  available: true,
};

const existingItem: ChefMenuItem = {
  id: '11111111-1111-4111-8111-111111111111',
  kitchenId: '22222222-2222-4222-8222-222222222222',
  itemName: 'Old Paneer',
  description: null,
  category: 'Mains',
  foodType: 'VEG',
  price: 199,
  currency: 'INR',
  servesCount: 1,
  preparationTimeMinutes: 20,
  spiceLevel: 'MILD',
  unitPackageWeightGrams: 350,
  thermoboxRequired: false,
  available: false,
  status: 'INACTIVE',
  images: [],
  createdAt: '2026-08-01T10:00:00Z',
  updatedAt: '2026-08-08T10:00:00Z',
};

describe('chef menu item form', () => {
  it('fails closed when backend-required create fields are missing', () => {
    const result = chefMenuFormSchema.safeParse(EMPTY_CHEF_MENU_FORM);
    expect(result.success).toBe(false);
  });

  it('maps Save Draft to the exact required MenuItemRequest with DRAFT status', () => {
    expect(buildChefMenuItemRequest(validForm, 'SAVE_DRAFT')).toEqual({
      itemName: 'Paneer Tikka',
      description: 'Charred paneer with peppers.',
      category: 'Starters',
      foodType: 'VEG',
      price: 249.5,
      servesCount: 2,
      preparationTimeMinutes: 35,
      spiceLevel: 'MEDIUM',
      unitPackageWeightGrams: 450,
      thermoboxRequired: true,
      available: true,
      status: 'DRAFT',
    });
  });

  it('maps Add Item to ACTIVE without inventing publication fields', () => {
    expect(buildChefMenuItemRequest(validForm, 'ADD_ITEM')).toMatchObject({
      status: 'ACTIVE',
      available: true,
    });
  });

  it('keeps optional server fields null when the Chef leaves them blank', () => {
    const request = buildChefMenuItemRequest(
      {
        ...validForm,
        description: ' ',
        servesCount: '',
        preparationTimeMinutes: '',
        spiceLevel: '',
      },
      'SAVE_DRAFT',
    );

    expect(request.description).toBeNull();
    expect(request.servesCount).toBeNull();
    expect(request.preparationTimeMinutes).toBeNull();
    expect(request.spiceLevel).toBeNull();
  });

  it('enforces the exact price floor and positive integer delivery metadata', () => {
    expect(
      chefMenuFormSchema.safeParse({...validForm, price: '0.009'}).success,
    ).toBe(false);
    expect(
      chefMenuFormSchema.safeParse({...validForm, unitPackageWeightGrams: '0'})
        .success,
    ).toBe(false);
    expect(
      chefMenuFormSchema.safeParse({...validForm, preparationTimeMinutes: '1.5'})
        .success,
    ).toBe(false);
  });

  it('prefills every writable replacement field from the canonical item', () => {
    expect(chefMenuItemToFormValues(existingItem)).toEqual({
      itemName: 'Old Paneer',
      description: '',
      category: 'Mains',
      foodType: 'VEG',
      price: '199',
      servesCount: '1',
      preparationTimeMinutes: '20',
      spiceLevel: 'MILD',
      unitPackageWeightGrams: '350',
      thermoboxRequired: false,
      available: false,
    });
  });

  it('builds a full PUT replacement while preserving currency and status', () => {
    expect(
      buildChefMenuReplacementRequest(
        {...validForm, available: true},
        existingItem,
      ),
    ).toEqual({
      itemName: 'Paneer Tikka',
      description: 'Charred paneer with peppers.',
      category: 'Starters',
      foodType: 'VEG',
      price: 249.5,
      servesCount: 2,
      preparationTimeMinutes: 35,
      spiceLevel: 'MEDIUM',
      unitPackageWeightGrams: 450,
      thermoboxRequired: true,
      available: true,
      currency: 'INR',
      status: 'INACTIVE',
    });
  });
});
