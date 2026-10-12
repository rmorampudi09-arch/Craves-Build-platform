import React from 'react';
import {useNavigation} from '@react-navigation/native';
import {ChefScreen, ChefTopBar, ComingSoon} from '../../features/chefShell/components/ui';

interface PlaceholderOptions {
  /** Sub-screen: back arrow instead of the bell. */
  back: boolean;
  /** false for routes above the tabs, where the bar is not visible. */
  tabBar: boolean;
}

// Stand-ins for screens later tasks build; each task swaps its import in ChefRootNavigator.
function createPlaceholder(title: string, {back, tabBar}: PlaceholderOptions) {
  function ChefPlaceholderScreen() {
    const navigation = useNavigation();
    return (
      <ChefScreen
        header={<ChefTopBar title={title} onBack={back ? () => navigation.goBack() : undefined} showBell={!back} />}
        withTabBar={tabBar}>
        <ComingSoon title={`${title} is on its way`} message="We are still building this screen. It will arrive in a coming update." />
      </ChefScreen>
    );
  }
  ChefPlaceholderScreen.displayName = `ChefPlaceholder(${title})`;
  return ChefPlaceholderScreen;
}

export const ChefEarningsPlaceholder = createPlaceholder('Earnings', {back: false, tabBar: true});
export const ChefOrdersScheduledPlaceholder = createPlaceholder('Scheduled orders', {back: false, tabBar: true});
export const ChefReviewsPlaceholder = createPlaceholder('Reviews', {back: true, tabBar: true});
export const ChefSecurityPlaceholder = createPlaceholder('Security', {back: true, tabBar: true});
export const ChefBankAccountPlaceholder = createPlaceholder('Bank account', {back: true, tabBar: true});
export const ChefNotificationsPlaceholder = createPlaceholder('Notifications', {back: true, tabBar: false});
export const ChefDailyLimitsPlaceholder = createPlaceholder('Daily limits', {back: true, tabBar: false});
export const ChefSupportTicketPlaceholder = createPlaceholder('Support ticket', {back: true, tabBar: false});
