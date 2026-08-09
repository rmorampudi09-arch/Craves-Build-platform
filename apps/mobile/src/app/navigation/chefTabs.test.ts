import {colors} from '../../design/tokens';
import {
  CHEF_TAB_ACTIVE_COLOR,
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

  it('uses Flame Red for the active Chef tab', () => {
    expect(CHEF_TAB_ACTIVE_COLOR).toBe(colors.flameRed);
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
