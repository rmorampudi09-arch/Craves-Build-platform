import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {
  createBottomTabNavigator,
  type BottomTabNavigationProp,
} from '@react-navigation/bottom-tabs';
import {
  useNavigation,
  type CompositeNavigationProp,
} from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from '@react-navigation/native-stack';
import {SafeAreaView} from 'react-native-safe-area-context';
import {colors, fontWeight, spacing, typography} from '../../design/tokens';
import {useAppDispatch} from '../store/hooks';
import {ChefAnalyticsScreen} from '../../features/chefAnalytics/screens/ChefAnalyticsScreen';
import {ChefDashboardScreen} from '../../features/chefDashboard/screens/ChefDashboardScreen';
import {ChefAddMenuItemScreen} from '../../features/chefMenu/screens/ChefAddMenuItemScreen';
import {ChefEditMenuItemScreen} from '../../features/chefMenu/screens/ChefEditMenuItemScreen';
import {ChefMenuScreen} from '../../features/chefMenu/screens/ChefMenuScreen';
import {ChefMenuItemDetailScreen} from '../../features/chefMenu/screens/ChefMenuItemDetailScreen';
import {ChefCompletedOrdersScreen} from '../../features/chefOrders/screens/ChefCompletedOrdersScreen';
import {ChefNewOrdersScreen} from '../../features/chefOrders/screens/ChefNewOrdersScreen';
import {ChefOrderDetailScreen} from '../../features/chefOrders/screens/ChefOrderDetailScreen';
import {ChefPreparingOrdersScreen} from '../../features/chefOrders/screens/ChefPreparingOrdersScreen';
import {ChefReadyOrdersScreen} from '../../features/chefOrders/screens/ChefReadyOrdersScreen';
import {ChefProfileScreen} from '../../features/chefProfile/screens/ChefProfileScreen';
import {isolateChefRole} from '../../features/chefShell/state/chefRoleIsolation';
import {
  ChefOperationalProvider,
  useChefOperationalState,
} from '../../features/chefShell/state/ChefOperationalProvider';
import {Icon} from '../../shared/components/Icon';
import {
  CHEF_TAB_ACTIVE_COLOR,
  CHEF_TAB_INACTIVE_COLOR,
  CHEF_TAB_STATE_OPTIONS,
  getChefTabDefinition,
} from './chefTabs';
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

const dashboardTab = getChefTabDefinition('Dashboard');
const ordersTab = getChefTabDefinition('Orders');
const menuTab = getChefTabDefinition('Menu');
const analyticsTab = getChefTabDefinition('Analytics');
const profileTab = getChefTabDefinition('Profile');

interface TabIconProps {
  color: string;
  size: number;
}

function DashboardTabIcon({color, size}: TabIconProps) {
  return <Icon name={dashboardTab.icon} color={color} size={size} />;
}

function OrdersTabIcon({color, size}: TabIconProps) {
  return <Icon name={ordersTab.icon} color={color} size={size} />;
}

function MenuTabIcon({color, size}: TabIconProps) {
  return <Icon name={menuTab.icon} color={color} size={size} />;
}

function AnalyticsTabIcon({color, size}: TabIconProps) {
  return <Icon name={analyticsTab.icon} color={color} size={size} />;
}

function ProfileTabIcon({color, size}: TabIconProps) {
  return <Icon name={profileTab.icon} color={color} size={size} />;
}

const tabScreenOptions = {
  headerShown: false,
  ...CHEF_TAB_STATE_OPTIONS,
  tabBarActiveTintColor: CHEF_TAB_ACTIVE_COLOR,
  tabBarInactiveTintColor: CHEF_TAB_INACTIVE_COLOR,
  tabBarHideOnKeyboard: true,
  tabBarLabelStyle: {
    fontSize: typography.tiny,
    fontWeight: fontWeight.semibold,
  },
  tabBarStyle: {
    backgroundColor: colors.white,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: spacing.xs,
  },
} as const;

const stackScreenOptions = {
  headerShown: false,
  animation: 'fade' as const,
};

type ChefMenuNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<ChefTabParamList, 'Menu'>,
  NativeStackNavigationProp<ChefProductStackParamList>
>;

function ChefMenuTabScreen() {
  const navigation = useNavigation<ChefMenuNavigation>();
  return (
    <View style={styles.menuScreenBoundary}>
      <ChefMenuScreen />
      <View style={styles.menuCreateBar}>
        <Pressable
          accessibilityLabel="Add new Chef menu item"
          accessibilityRole="button"
          onPress={() => navigation.navigate('ChefAddMenuItem')}
          style={({pressed}) => [styles.menuCreateButton, pressed && styles.pressed]}>
          <Text style={styles.menuCreateButtonText}>+ Add new item</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ChefOrdersNavigator() {
  return (
    <OrdersStack.Navigator
      initialRouteName="ChefOrdersNew"
      screenOptions={stackScreenOptions}>
      <OrdersStack.Screen
        name="ChefOrdersPreparing"
        component={ChefPreparingOrdersScreen}
      />
      <OrdersStack.Screen name="ChefOrdersNew" component={ChefNewOrdersScreen} />
      <OrdersStack.Screen name="ChefOrdersReady" component={ChefReadyOrdersScreen} />
      <OrdersStack.Screen
        name="ChefOrdersCompleted"
        component={ChefCompletedOrdersScreen}
      />
    </OrdersStack.Navigator>
  );
}

function ChefProfileNavigator() {
  return (
    <ProfileStack.Navigator
      initialRouteName="ChefProfileHome"
      screenOptions={stackScreenOptions}>
      <ProfileStack.Screen name="ChefProfileHome" component={ChefProfileScreen} />
    </ProfileStack.Navigator>
  );
}

function ChefTabsNavigator() {
  const {counters} = useChefOperationalState();
  const ordersBadge =
    counters.pendingAcceptance > 99
      ? '99+'
      : counters.pendingAcceptance > 0
        ? counters.pendingAcceptance
        : undefined;

  return (
    <Tab.Navigator initialRouteName="Dashboard" screenOptions={tabScreenOptions}>
      <Tab.Screen
        name="Dashboard"
        component={ChefDashboardScreen}
        options={{
          tabBarAccessibilityLabel: `${dashboardTab.label} tab`,
          tabBarLabel: dashboardTab.label,
          tabBarIcon: DashboardTabIcon,
        }}
      />
      <Tab.Screen
        name="Orders"
        component={ChefOrdersNavigator}
        options={{
          tabBarAccessibilityLabel:
            counters.pendingAcceptance > 0
              ? `${ordersTab.label} tab, ${counters.pendingAcceptance} new orders`
              : `${ordersTab.label} tab`,
          tabBarLabel: ordersTab.label,
          tabBarIcon: OrdersTabIcon,
          tabBarBadge: ordersBadge,
          tabBarBadgeStyle: styles.ordersBadge,
        }}
      />
      <Tab.Screen
        name="Menu"
        component={ChefMenuTabScreen}
        options={{
          tabBarAccessibilityLabel: `${menuTab.label} tab`,
          tabBarLabel: menuTab.label,
          tabBarIcon: MenuTabIcon,
        }}
      />
      <Tab.Screen
        name="Analytics"
        component={ChefAnalyticsScreen}
        options={{
          tabBarAccessibilityLabel: `${analyticsTab.label} tab`,
          tabBarLabel: analyticsTab.label,
          tabBarIcon: AnalyticsTabIcon,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ChefProfileNavigator}
        options={{
          tabBarAccessibilityLabel: `${profileTab.label} tab`,
          tabBarLabel: profileTab.label,
          tabBarIcon: ProfileTabIcon,
        }}
      />
    </Tab.Navigator>
  );
}

function ChefProductNavigator() {
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
          name="ChefEditMenuItem"
          component={ChefEditMenuItemScreen}
          options={{gestureEnabled: false}}
        />
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

  return <ChefProductNavigator />;
}

const styles = StyleSheet.create({
  menuScreenBoundary: {flex: 1},
  menuCreateBar: {
    backgroundColor: colors.white,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  menuCreateButton: {
    alignItems: 'center',
    backgroundColor: colors.flameRed,
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  menuCreateButtonText: {
    color: colors.white,
    fontSize: typography.button,
    fontWeight: fontWeight.bold,
  },
  pressed: {opacity: 0.65},
  ordersBadge: {
    backgroundColor: colors.flameRed,
    color: colors.white,
    fontSize: typography.tiny,
  },
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
