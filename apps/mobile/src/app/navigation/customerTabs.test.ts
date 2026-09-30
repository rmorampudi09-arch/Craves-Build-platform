import {colors, fontWeight, typography} from '../../design/tokens';
import {
  CUSTOMER_PROFILE_TAB_STATE_OPTIONS,
  CUSTOMER_TAB_ACTIVE_COLOR,
  CUSTOMER_TAB_INACTIVE_COLOR,
  CUSTOMER_TAB_LABEL_STYLE,
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

  it('keeps every customer menu icon and label black', () => {
    expect(CUSTOMER_TAB_ACTIVE_COLOR).toBe(colors.black);
    expect(CUSTOMER_TAB_INACTIVE_COLOR).toBe(colors.black);
  });

  it('uses bold menu labels without changing their size or spacing', () => {
    expect(CUSTOMER_TAB_LABEL_STYLE).toEqual({
      fontSize: typography.small,
      fontWeight: fontWeight.bold,
      marginTop: 2,
      marginBottom: 0,
    });
  });

  it('keeps each tab navigator mounted instead of popping its stack on blur', () => {
    expect(CUSTOMER_TAB_STATE_OPTIONS).toEqual({
      lazy: true,
      popToTopOnBlur: false,
    });
  });

  it('resets only the Profile nested stack after leaving a deep profile route', () => {
    expect(CUSTOMER_PROFILE_TAB_STATE_OPTIONS).toEqual({
      lazy: true,
      popToTopOnBlur: true,
    });
  });

  it('maps every route to an explicit accessible icon definition', () => {
    expect(getCustomerTabDefinition('Home').icon).toBe('home');
    expect(getCustomerTabDefinition('Chefs').icon).toBe('chef');
    expect(getCustomerTabDefinition('Orders').icon).toBe('orders');
    expect(getCustomerTabDefinition('Profile').icon).toBe('account');
  });
});
