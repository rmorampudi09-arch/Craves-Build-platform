import {
  isCurrentImmersiveRoute,
  resolveRouteChromePolicy,
} from './navigationPolicy';

describe('navigationPolicy', () => {
  it('keeps authentication and account-resolution routes immersive', () => {
    expect(isCurrentImmersiveRoute('PhoneSignIn')).toBe(true);
    expect(isCurrentImmersiveRoute('CustomerAccountStatus')).toBe(true);
    expect(isCurrentImmersiveRoute('ChefAccountStatus')).toBe(true);

    expect(resolveRouteChromePolicy('Customer', 'CustomerAccountStatus')).toEqual({
      bottomNavigationVisible: false,
      viewCartEligible: false,
      immersive: true,
    });
  });

  it('enables customer shell chrome for the four customer tab routes', () => {
    for (const routeName of ['Home', 'Chefs', 'Orders', 'Profile'] as const) {
      expect(resolveRouteChromePolicy('Customer', routeName)).toEqual({
        bottomNavigationVisible: true,
        viewCartEligible: true,
        immersive: false,
      });
    }
  });

  it('keeps focused filter and dish-detail routes immersive', () => {
    for (const routeName of ['CustomerFilterSort', 'CustomerDishDetail'] as const) {
      expect(isCurrentImmersiveRoute(routeName)).toBe(true);
      expect(resolveRouteChromePolicy('Customer', routeName)).toEqual({
        bottomNavigationVisible: false,
        viewCartEligible: false,
        immersive: true,
      });
    }
  });

  it('never makes customer cart chrome eligible in the chef domain', () => {
    expect(resolveRouteChromePolicy('Chef')).toEqual({
      bottomNavigationVisible: true,
      viewCartEligible: false,
      immersive: false,
    });
  });

  it('keeps transactional and modal domains immersive by default', () => {
    expect(resolveRouteChromePolicy('Transactional')).toEqual({
      bottomNavigationVisible: false,
      viewCartEligible: false,
      immersive: true,
    });
    expect(resolveRouteChromePolicy('Modal')).toEqual({
      bottomNavigationVisible: false,
      viewCartEligible: false,
      immersive: true,
    });
  });
});
