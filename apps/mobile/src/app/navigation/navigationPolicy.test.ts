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

  it('allows customer shell chrome only at the domain default boundary', () => {
    expect(resolveRouteChromePolicy('Customer')).toEqual({
      bottomNavigationVisible: true,
      viewCartEligible: true,
      immersive: false,
    });
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
