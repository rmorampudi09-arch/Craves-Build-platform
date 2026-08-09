import {
  EMPTY_CHEF_MENU_FORM,
  buildChefMenuItemRequest,
  chefMenuFormSchema,
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

describe('chef menu add-item form', () => {
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
});
