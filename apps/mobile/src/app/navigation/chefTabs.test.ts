import {bottomMenu, colors} from '../../design/tokens';
import {
  CHEF_TAB_ACTIVE_COLOR,
  CHEF_TAB_INACTIVE_COLOR,
  CHEF_TAB_STATE_OPTIONS,
  CHEF_TABS,
  getChefTabDefinition,
} from './chefTabs';

describe('chefTabs', () => {
  it('registers the required Chef tabs in product order', () => {
    expect(CHEF_TABS.map(tab => tab.routeName)).toEqual([
      'Dashboard',
      'Orders',
      'Menu',
      'Analytics',
      'Profile',
    ]);
    expect(CHEF_TABS.map(tab => tab.label)).toEqual([
      'Dashboard',
      'Orders',
      'Menu',
      'Analytics',
      'Profile',
    ]);
  });

  it('contains no customer cart destination or cart icon', () => {
    expect(CHEF_TABS.some(tab => tab.routeName === ('Cart' as never))).toBe(false);
    expect(CHEF_TABS.some(tab => tab.icon === 'cart')).toBe(false);
  });

  it('uses the same red active and softer inactive menu foreground as Customer tabs', () => {
    expect(CHEF_TAB_ACTIVE_COLOR).toBe(colors.flameRedAccessible);
    expect(CHEF_TAB_INACTIVE_COLOR).toBe(bottomMenu.inactiveColor);
    expect(CHEF_TAB_INACTIVE_COLOR).not.toBe(colors.black);
  });

  it('preserves each Chef tab instead of popping it on blur', () => {
    expect(CHEF_TAB_STATE_OPTIONS).toEqual({
      lazy: true,
      popToTopOnBlur: false,
    });
  });

  it('maps every Chef route to an explicit icon definition', () => {
    expect(getChefTabDefinition('Dashboard').icon).toBe('home');
    expect(getChefTabDefinition('Orders').icon).toBe('orders');
    expect(getChefTabDefinition('Menu').icon).toBe('chef');
    expect(getChefTabDefinition('Analytics').icon).toBe('analytics');
    expect(getChefTabDefinition('Profile').icon).toBe('account');
  });
});
