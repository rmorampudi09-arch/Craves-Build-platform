import {bottomMenu, colors} from '../../design/tokens';
import {
  CHEF_ORDER_ROUTES,
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
      'Earnings',
      'Profile',
    ]);
    expect(CHEF_TABS.map(tab => tab.label)).toEqual([
      'Home',
      'Orders',
      'Menu',
      'Earnings',
      'Profile',
    ]);
  });

  it('contains no customer cart destination or cart icon', () => {
    expect(CHEF_TABS.some(tab => tab.routeName === ('Cart' as never))).toBe(false);
    expect(CHEF_TABS.some(tab => tab.icon === 'cart')).toBe(false);
  });

  it('uses a red active tab and dark label ink on the light tab bar', () => {
    expect(CHEF_TAB_ACTIVE_COLOR).toBe(colors.flameRedAccessible);
    expect(CHEF_TAB_INACTIVE_COLOR).toBe(bottomMenu.inactiveColor);
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
    expect(getChefTabDefinition('Earnings').icon).toBe('wallet');
    expect(getChefTabDefinition('Profile').icon).toBe('account');
  });

  it('registers Scheduled beside the four status routes in the Orders stack', () => {
    expect([...CHEF_ORDER_ROUTES].sort()).toEqual([
      'ChefOrdersCompleted',
      'ChefOrdersNew',
      'ChefOrdersPreparing',
      'ChefOrdersReady',
      'ChefOrdersScheduled',
    ]);
  });
});
