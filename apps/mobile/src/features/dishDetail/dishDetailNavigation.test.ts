import {isDishSheetDismissal, kitchenNavigationAction} from './dishDetailNavigation';

const kitchenId = '11111111-1111-4111-8111-111111111111';
const dish = {name: 'CustomerDishDetail', params: {menuItemId: 'm1'}};

describe('kitchenNavigationAction', () => {
  it('goes back when the sheet was opened from the same kitchen page', () => {
    const routes = [{name: 'CustomerKitchenProfile', params: {kitchenId}}, dish];
    expect(kitchenNavigationAction(routes, 1, kitchenId)).toBe('back');
  });

  it('replaces the sheet when it was opened from anywhere else', () => {
    expect(kitchenNavigationAction([{name: 'CustomerHomeRoot'}, dish], 1, kitchenId)).toBe('replace');
    expect(kitchenNavigationAction([dish], 0, kitchenId)).toBe('replace');
    const otherKitchen = [
      {name: 'CustomerKitchenProfile', params: {kitchenId: '22222222-2222-4222-8222-222222222222'}},
      dish,
    ];
    expect(kitchenNavigationAction(otherKitchen, 1, kitchenId)).toBe('replace');
  });
});

describe('isDishSheetDismissal', () => {
  it('animates only the actions that close the sheet', () => {
    expect(isDishSheetDismissal('GO_BACK')).toBe(true);
    expect(isDishSheetDismissal('POP')).toBe(true);
    expect(isDishSheetDismissal('REPLACE')).toBe(false);
    expect(isDishSheetDismissal('RESET')).toBe(false);
  });
});
