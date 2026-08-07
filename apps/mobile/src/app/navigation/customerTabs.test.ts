import {colors} from '../../design/tokens';
import {
  CUSTOMER_TAB_ACTIVE_COLOR,
  CUSTOMER_TAB_STATE_OPTIONS,
  CUSTOMER_TABS,
  getCustomerTabDefinition,
} from './customerTabs';

describe('customerTabs', () => {
  it('registers the required customer tabs in product order', () => {
    expect(CUSTOMER_TABS.map(tab => tab.routeName)).toEqual([
      'Home',
      'Chefs',
      'Orders',
      'Profile',
    ]);
    expect(CUSTOMER_TABS.map(tab => tab.label)).toEqual([
      'Home',
      'Chefs',
      'Orders',
      'Profile',
    ]);
  });

  it('uses Flame Red for the active customer tab', () => {
    expect(CUSTOMER_TAB_ACTIVE_COLOR).toBe(colors.flameRed);
  });

  it('keeps each tab navigator mounted instead of popping its stack on blur', () => {
    expect(CUSTOMER_TAB_STATE_OPTIONS).toEqual({
      lazy: true,
      popToTopOnBlur: false,
    });
  });

  it('maps every route to an explicit accessible icon definition', () => {
    expect(getCustomerTabDefinition('Home').icon).toBe('home');
    expect(getCustomerTabDefinition('Chefs').icon).toBe('chef');
    expect(getCustomerTabDefinition('Orders').icon).toBe('orders');
    expect(getCustomerTabDefinition('Profile').icon).toBe('account');
  });
});
