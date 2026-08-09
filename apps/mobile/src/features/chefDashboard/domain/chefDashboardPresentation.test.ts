import {
  formatChefDashboardOrderStatus,
  getChefDashboardGreeting,
  shortChefDashboardOrderReference,
} from './chefDashboardPresentation';

describe('chefDashboardPresentation', () => {
  it('uses day-part greetings without depending on fabricated profile data', () => {
    expect(getChefDashboardGreeting(8)).toBe('Good morning');
    expect(getChefDashboardGreeting(14)).toBe('Good afternoon');
    expect(getChefDashboardGreeting(20)).toBe('Good evening');
  });

  it('formats operational statuses for dashboard cards', () => {
    expect(formatChefDashboardOrderStatus('PREPARING')).toBe('Preparing');
    expect(formatChefDashboardOrderStatus('READY_FOR_PICKUP')).toBe(
      'Ready for pickup',
    );
  });

  it('creates a short non-empty display reference from an order id', () => {
    expect(
      shortChefDashboardOrderReference(
        '11111111-1111-4111-8111-123456abcdef',
      ),
    ).toBe('#ABCDEF');
  });
});
