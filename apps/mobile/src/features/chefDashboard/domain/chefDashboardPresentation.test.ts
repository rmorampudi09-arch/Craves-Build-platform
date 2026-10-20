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

  it('shows the same order number as the customer and web', () => {
    expect(
      shortChefDashboardOrderReference(
        '0bde0000-0000-4000-8000-000000000101',
      ),
    ).toBe('#0BDE0000');
  });
});
