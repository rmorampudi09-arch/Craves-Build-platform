import type {CartScreenItem} from './domain/cartScreenModel';
import {
  getCartCheckoutStatusCopy,
  getCartItemInitial,
  groupCartItemsByKitchen,
} from './cartUiModel';

const line = (
  lineId: string,
  kitchenId: string,
  kitchenName: string,
  itemName: string,
): CartScreenItem => ({
  lineId,
  menuItemId: `menu-${lineId}`,
  kitchenId,
  itemName,
  kitchenName,
  unitPrice: {amount: '120.00', currency: 'INR'},
  quantity: 1,
  lineTotal: {amount: '120.00', currency: 'INR'},
  createdAt: '2026-08-08T10:00:00.000Z',
  updatedAt: '2026-08-08T10:00:00.000Z',
});

describe('cartUiModel', () => {
  it('groups cart lines by kitchen without changing server line order', () => {
    const sections = groupCartItemsByKitchen([
      line('1', 'kitchen-a', 'A Kitchen', 'Idli'),
      line('2', 'kitchen-b', 'B Kitchen', 'Dosa'),
      line('3', 'kitchen-a', 'A Kitchen', 'Vada'),
    ]);

    expect(sections).toHaveLength(2);
    expect(sections[0]?.kitchenName).toBe('A Kitchen');
    expect(sections[0]?.data.map(item => item.itemName)).toEqual(['Idli', 'Vada']);
    expect(sections[1]?.data.map(item => item.itemName)).toEqual(['Dosa']);
  });

  it('fails checkout copy closed while the authoritative bill is incomplete', () => {
    expect(
      getCartCheckoutStatusCopy(
        {enabled: true, status: 'ELIGIBLE', reasonCode: null},
        false,
      ),
    ).toContain('complete bill');
  });

  it('uses a deterministic non-media fallback initial for cart rows', () => {
    expect(getCartItemInitial('  Paneer Tikka  ')).toBe('P');
    expect(getCartItemInitial('   ')).toBe('C');
  });
});
