import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {CommonActions} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {SafeAreaView} from 'react-native-safe-area-context';
import {resolveReducedMotionAnimation} from '../../design/motion';
import {useReducedMotionPreference} from '../../design/reducedMotion';
import {colors, fontWeight, spacing, typography} from '../../design/tokens';
import {useAppDispatch} from '../store/hooks';
import {ChefBusinessInformationScreen} from '../../features/chefBusinessInformation/screens/ChefBusinessInformationScreen';
import {ChefBankAccountScreen} from '../../features/chefBankOnboarding/screens/ChefBankAccountScreen';
import {ChefDashboardScreen} from '../../features/chefDashboard/screens/ChefDashboardScreen';
import {ChefAddMenuItemScreen} from '../../features/chefMenu/screens/ChefAddMenuItemScreen';
import {ChefEditMenuItemScreen} from '../../features/chefMenu/screens/ChefEditMenuItemScreen';
import {ChefMenuItemDetailScreen} from '../../features/chefMenu/screens/ChefMenuItemDetailScreen';
import {ChefOrderDetailScreen} from '../../features/chefOrders/screens/ChefOrderDetailScreen';
import {ChefOrdersScreen} from '../../features/chefOrders/screens/ChefOrdersScreen';
import {ChefEarningsScreen} from '../../features/chefPayout/screens/ChefEarningsScreen';
import {ChefPayoutHistoryScreen} from '../../features/chefPayout/screens/ChefPayoutHistoryScreen';
import {ChefAppPreferencesScreen} from '../../features/chefPreferences/screens/ChefAppPreferencesScreen';
import {ChefEditProfileScreen} from '../../features/chefProfile/screens/ChefEditProfileScreen';
import {ChefReferralEarningsScreen} from '../../features/chefReferrals/screens/ChefReferralEarningsScreen';
import {ChefReferralScreen} from '../../features/chefReferrals/screens/ChefReferralScreen';
import {ChefKitchenScheduleScreen} from '../../features/chefSchedule/screens/ChefKitchenScheduleScreen';
import {ChefProfileScreen} from '../../features/chefProfile/screens/ChefProfileScreen';
import {ChefSecurityScreen} from '../../features/chefProfile/screens/ChefSecurityScreen';
import {ChefEditProfileDraftProvider} from '../../features/chefProfile/state/ChefEditProfileDraftProvider';
import {ChefToastProvider} from '../../features/chefShell/components/ui';
import {ChefNotificationsScreen} from '../../features/chefShell/screens/ChefNotificationsScreen';
import {isolateChefRole} from '../../features/chefShell/state/chefRoleIsolation';
import {ChefOperationalProvider} from '../../features/chefShell/state/ChefOperationalProvider';
import {ChefMealPlanEditorScreen} from '../../features/chefSubscription/screens/ChefMealPlanEditorScreen';
import {ChefDailyLimitsScreen} from '../../features/chefSubscription/screens/ChefDailyLimitsScreen';
import {ChefSupportScreen} from '../../features/chefSupport/screens/ChefSupportScreen';
import {ChefSupportTicketScreen} from '../../features/chefSupport/screens/ChefSupportTicketScreen';
import {ChefSupportChatRouteScreen} from '../../features/supportChat/screens/SupportChatRouteScreens';
import {ChefReviewsScreen} from '../../features/reviews/screens/ChefReviewsScreen';
import {ChefMenuTabScreen} from './ChefMenuTabScreen';
import {ChefScheduledOrdersRedirect} from './ChefScheduledOrdersRedirect';
import {renderChefTabBar} from './ChefTabBar';
import {CHEF_ORDER_ROUTES, CHEF_TAB_STATE_OPTIONS} from './chefTabs';
import type {
  ChefOrdersStackParamList,
  ChefProductStackParamList,
  ChefProfileStackParamList,
  ChefTabParamList,
} from './types';

const Tab = createBottomTabNavigator<ChefTabParamList>();
const Stack = createNativeStackNavigator<ChefProductStackParamList>();
const OrdersStack = createNativeStackNavigator<ChefOrdersStackParamList>();
const ProfileStack = createNativeStackNavigator<ChefProfileStackParamList>();

const chefTabScreenOptions = {
  headerShown: false,
  ...CHEF_TAB_STATE_OPTIONS,
  tabBarHideOnKeyboard: true,
  sceneStyle: {backgroundColor: colors.white},
} as const;

function useChefStackScreenOptions() {
  const reduceMotionEnabled = useReducedMotionPreference();
  return React.useMemo(
    () => ({
      headerShown: false,
      animation: resolveReducedMotionAnimation(
        'fade' as const,
        reduceMotionEnabled,
      ),
    }),
    [reduceMotionEnabled],
  );
}

/** Opening a filter from another tab pushes it; the filters replace each other, so keep only the one on top. */
const keepOnlyFocusedOrdersFilter: React.ComponentProps<typeof OrdersStack.Navigator>['screenListeners'] = ({navigation}) => ({
  focus: () => {
    if (navigation.getState().routes.length > 1) {
      navigation.dispatch(state => CommonActions.reset({...state, index: 0, routes: state.routes.slice(-1)}));
    }
  },
});

function ChefOrdersNavigator() {
  const stackScreenOptions = useChefStackScreenOptions();
  // Switching between the order lists should feel like changing a filter, not opening a page.
  const screenOptions = React.useMemo(
    () => ({...stackScreenOptions, animation: 'none' as const}),
    [stackScreenOptions],
  );
  return (
    <OrdersStack.Navigator
      initialRouteName="ChefOrdersNew"
      screenListeners={keepOnlyFocusedOrdersFilter}
      screenOptions={screenOptions}>
      {CHEF_ORDER_ROUTES.map(name => (
        <OrdersStack.Screen key={name} name={name} component={ChefOrdersScreen} />
      ))}
    </OrdersStack.Navigator>
  );
}

function ChefProfileNavigator() {
  const stackScreenOptions = useChefStackScreenOptions();
  return (
    <ChefEditProfileDraftProvider>
      <ProfileStack.Navigator
        initialRouteName="ChefProfileHome"
        screenOptions={stackScreenOptions}>
        <ProfileStack.Screen name="ChefProfileHome" component={ChefProfileScreen} />
        <ProfileStack.Screen
          name="ChefBusinessInformation"
          component={ChefBusinessInformationScreen}
        />
        <ProfileStack.Screen
          name="ChefPayoutHistory"
          component={ChefPayoutHistoryScreen}
        />
        <ProfileStack.Screen
          name="ChefSubscriptionPlan"
          component={ChefDailyLimitsScreen}
        />
        <ProfileStack.Screen
          name="ChefAppPreferences"
          component={ChefAppPreferencesScreen}
        />
        <ProfileStack.Screen
          name="ChefSupport"
          component={ChefSupportScreen}
        />
        <ProfileStack.Screen
          name="ChefReferral"
          component={ChefReferralScreen}
        />
        <ProfileStack.Screen
          name="ChefReferralEarnings"
          component={ChefReferralEarningsScreen}
        />
        <ProfileStack.Screen
          name="ChefKitchenSchedule"
          component={ChefKitchenScheduleScreen}
        />
        <ProfileStack.Screen
          name="ChefScheduledOrders"
          component={ChefScheduledOrdersRedirect}
        />
        <ProfileStack.Screen name="ChefReviews" component={ChefReviewsScreen} />
        <ProfileStack.Screen name="ChefSecurity" component={ChefSecurityScreen} />
        <ProfileStack.Screen name="ChefBankAccount" component={ChefBankAccountScreen} />
        <ProfileStack.Screen
          name="ChefEditProfile"
          component={ChefEditProfileScreen}
          options={{gestureEnabled: false}}
        />
      </ProfileStack.Navigator>
    </ChefEditProfileDraftProvider>
  );
}

function ChefTabsNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="Dashboard"
      screenOptions={chefTabScreenOptions}
      tabBar={renderChefTabBar}>
      <Tab.Screen name="Dashboard" component={ChefDashboardScreen} />
      <Tab.Screen name="Orders" component={ChefOrdersNavigator} />
      <Tab.Screen name="Menu" component={ChefMenuTabScreen} />
      <Tab.Screen name="Earnings" component={ChefEarningsScreen} />
      <Tab.Screen name="Profile" component={ChefProfileNavigator} />
    </Tab.Navigator>
  );
}

function ChefProductNavigator() {
  const stackScreenOptions = useChefStackScreenOptions();
  return (
    <ChefOperationalProvider>
      <Stack.Navigator initialRouteName="ChefTabs" screenOptions={stackScreenOptions}>
        <Stack.Screen name="ChefTabs" component={ChefTabsNavigator} />
        <Stack.Screen name="ChefOrderDetail" component={ChefOrderDetailScreen} />
        <Stack.Screen
          name="ChefMenuItemDetail"
          component={ChefMenuItemDetailScreen}
        />
        <Stack.Screen name="ChefAddMenuItem" component={ChefAddMenuItemScreen} />
        <Stack.Screen
          name="ChefMealPlanEditor"
          component={ChefMealPlanEditorScreen}
          options={{gestureEnabled: false}}
        />
        <Stack.Screen
          name="ChefEditMenuItem"
          component={ChefEditMenuItemScreen}
          options={{gestureEnabled: false}}
        />
        <Stack.Screen name="ChefNotifications" component={ChefNotificationsScreen} />
        <Stack.Screen name="ChefDailyLimits" component={ChefDailyLimitsScreen} />
        <Stack.Screen name="ChefSupportTicket" component={ChefSupportTicketScreen} />
        <Stack.Screen name="ChefSupportChat" component={ChefSupportChatRouteScreen} />
      </Stack.Navigator>
    </ChefOperationalProvider>
  );
}

export function ChefRootNavigator() {
  const dispatch = useAppDispatch();
  const [isolationAttempt, setIsolationAttempt] = React.useState(0);
  const [isolationState, setIsolationState] = React.useState<
    'pending' | 'ready' | 'error'
  >('pending');

  React.useEffect(() => {
    let mounted = true;
    setIsolationState('pending');

    isolateChefRole(dispatch)
      .then(() => {
        if (mounted) {
          setIsolationState('ready');
        }
      })
      .catch(() => {
        if (mounted) {
          setIsolationState('error');
        }
      });

    return () => {
      mounted = false;
    };
  }, [dispatch, isolationAttempt]);

  if (isolationState !== 'ready') {
    return (
      <SafeAreaView style={styles.isolationSafeArea}>
        <View style={styles.isolationContent}>
          <Text accessibilityRole="header" style={styles.isolationTitle}>
            {isolationState === 'error'
              ? 'Chef workspace unavailable'
              : 'Preparing Chef workspace'}
          </Text>
          {isolationState === 'error' ? (
            <>
              <Text style={styles.isolationMessage}>
                Customer session state could not be fully isolated. Retry before opening the Chef workspace.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retry Chef workspace isolation"
                onPress={() => setIsolationAttempt(attempt => attempt + 1)}
                style={styles.retryButton}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <ChefToastProvider>
      <ChefProductNavigator />
    </ChefToastProvider>
  );
}

const styles = StyleSheet.create({
  isolationSafeArea: {
    flex: 1,
    backgroundColor: colors.surfaceBase,
  },
  isolationContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  isolationTitle: {
    color: colors.textPrimary,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  isolationMessage: {
    color: colors.textSecondary,
    fontSize: typography.body,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: colors.flameRed,
    borderRadius: 999,
    justifyContent: 'center',
    marginTop: spacing.lg,
    minHeight: 48,
    minWidth: 120,
    paddingHorizontal: spacing.lg,
  },
  retryButtonText: {
    color: colors.white,
    fontSize: typography.button,
    fontWeight: fontWeight.semibold,
  },
});
