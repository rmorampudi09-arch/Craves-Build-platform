import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {SafeAreaView} from 'react-native-safe-area-context';
import {colors, fontWeight, spacing, typography} from '../../design/tokens';
import {useAppDispatch} from '../store/hooks';
import {ChefDashboardScreen} from '../../features/chefDashboard/screens/ChefDashboardScreen';
import {ChefOrderDetailScreen} from '../../features/chefOrders/screens/ChefOrderDetailScreen';
import {isolateChefRole} from '../../features/chefShell/state/chefRoleIsolation';
import {
  ChefOperationalProvider,
  useChefOperationalState,
} from '../../features/chefShell/state/ChefOperationalProvider';
import {ChefHeader} from '../../features/chefShell/components/ChefHeader';
import {Icon} from '../../shared/components/Icon';
import {
  CHEF_TAB_ACTIVE_COLOR,
  CHEF_TAB_INACTIVE_COLOR,
  CHEF_TAB_STATE_OPTIONS,
  getChefTabDefinition,
} from './chefTabs';
import type {ChefProductStackParamList, ChefTabParamList} from './types';

const Tab = createBottomTabNavigator<ChefTabParamList>();
const Stack = createNativeStackNavigator<ChefProductStackParamList>();

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

function ChefShellRouteBoundary({title}: {title: string}) {
  return (
    <SafeAreaView style={styles.routeSafeArea} edges={['top', 'left', 'right']}>
      <ChefHeader title={title} />
      <View style={styles.routeContent}>
        <Text style={styles.routeTitle}>{title}</Text>
      </View>
    </SafeAreaView>
  );
}

function ChefOrdersBoundaryScreen() {
  return <ChefShellRouteBoundary title="Orders" />;
}

function ChefMenuBoundaryScreen() {
  return <ChefShellRouteBoundary title="Menu" />;
}

function ChefAnalyticsBoundaryScreen() {
  return <ChefShellRouteBoundary title="Analytics" />;
}

function ChefProfileBoundaryScreen() {
  return <ChefShellRouteBoundary title="Profile" />;
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
        component={ChefOrdersBoundaryScreen}
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
        component={ChefMenuBoundaryScreen}
        options={{
          tabBarAccessibilityLabel: `${menuTab.label} tab`,
          tabBarLabel: menuTab.label,
          tabBarIcon: MenuTabIcon,
        }}
      />
      <Tab.Screen
        name="Analytics"
        component={ChefAnalyticsBoundaryScreen}
        options={{
          tabBarAccessibilityLabel: `${analyticsTab.label} tab`,
          tabBarLabel: analyticsTab.label,
          tabBarIcon: AnalyticsTabIcon,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ChefProfileBoundaryScreen}
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
      </Stack.Navigator>
    </ChefOperationalProvider>
  );
}

export function ChefRootNavigator() {
  const dispatch = useAppDispatch();
  const [isolationAttempt, setIsolationAttempt] = React.useState(0);
  const [isolationState, setIsolationState] = React.useState<'pending' | 'ready' | 'error'>('pending');

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
            {isolationState === 'error' ? 'Chef workspace unavailable' : 'Preparing Chef workspace'}
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
  routeSafeArea: {
    flex: 1,
    backgroundColor: colors.surfaceBase,
  },
  routeContent: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },
  routeTitle: {
    color: colors.textPrimary,
    fontSize: typography.hero,
    fontWeight: fontWeight.bold,
  },
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
