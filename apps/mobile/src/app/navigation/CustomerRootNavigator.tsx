import React from 'react';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {colors, fontWeight, spacing, typography} from '../../design/tokens';
import {CustomerAccountStatusScreen} from '../../features/auth/screens/CustomerAccountStatusScreen';
import {DiscoverHomeChefsRouteScreen} from '../../features/chefDiscovery/screens/DiscoverHomeChefsRouteScreen';
import {CustomerHomeScreen} from '../../features/home/screens/CustomerHomeScreen';
import {Icon} from '../../shared/components/Icon';
import {
  CustomerBottomNavVisibilityProvider,
  CustomerBottomTabBar,
  useCustomerBottomNavReveal,
} from './CustomerBottomNavController';
import {
  CUSTOMER_TAB_ACTIVE_COLOR,
  CUSTOMER_TAB_INACTIVE_COLOR,
  CUSTOMER_TAB_STATE_OPTIONS,
  getCustomerTabDefinition,
} from './customerTabs';
import type {
  CustomerChefsStackParamList,
  CustomerHomeStackParamList,
  CustomerOrdersStackParamList,
  CustomerProfileStackParamList,
  CustomerTabParamList,
} from './types';

const Tab = createBottomTabNavigator<CustomerTabParamList>();
const HomeStack = createNativeStackNavigator<CustomerHomeStackParamList>();
const ChefsStack = createNativeStackNavigator<CustomerChefsStackParamList>();
const OrdersStack = createNativeStackNavigator<CustomerOrdersStackParamList>();
const ProfileStack = createNativeStackNavigator<CustomerProfileStackParamList>();

const homeTab = getCustomerTabDefinition('Home');
const chefsTab = getCustomerTabDefinition('Chefs');
const ordersTab = getCustomerTabDefinition('Orders');
const profileTab = getCustomerTabDefinition('Profile');

interface TabIconProps {
  color: string;
  size: number;
}

function HomeTabIcon({color, size}: TabIconProps) {
  return <Icon name={homeTab.icon} color={color} size={size} />;
}

function ChefsTabIcon({color, size}: TabIconProps) {
  return <Icon name={chefsTab.icon} color={color} size={size} />;
}

function OrdersTabIcon({color, size}: TabIconProps) {
  return <Icon name={ordersTab.icon} color={color} size={size} />;
}

function ProfileTabIcon({color, size}: TabIconProps) {
  return <Icon name={profileTab.icon} color={color} size={size} />;
}

const stackScreenOptions = {
  headerShown: false,
  animation: 'fade' as const,
};

const tabScreenOptions = {
  headerShown: false,
  ...CUSTOMER_TAB_STATE_OPTIONS,
  tabBarActiveTintColor: CUSTOMER_TAB_ACTIVE_COLOR,
  tabBarInactiveTintColor: CUSTOMER_TAB_INACTIVE_COLOR,
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

const homeTabOptions = {
  tabBarAccessibilityLabel: `${homeTab.label} tab`,
  tabBarLabel: homeTab.label,
  tabBarIcon: HomeTabIcon,
};

const chefsTabOptions = {
  tabBarAccessibilityLabel: `${chefsTab.label} tab`,
  tabBarLabel: chefsTab.label,
  tabBarIcon: ChefsTabIcon,
};

const ordersTabOptions = {
  tabBarAccessibilityLabel: `${ordersTab.label} tab`,
  tabBarLabel: ordersTab.label,
  tabBarIcon: OrdersTabIcon,
};

const profileTabOptions = {
  tabBarAccessibilityLabel: `${profileTab.label} tab`,
  tabBarLabel: profileTab.label,
  tabBarIcon: ProfileTabIcon,
};

function useCustomerTabRootListeners() {
  const showBottomNav = useCustomerBottomNavReveal();

  return React.useMemo(
    () => ({
      focus: showBottomNav,
    }),
    [showBottomNav],
  );
}

function CustomerHomeStackNavigator() {
  const rootListeners = useCustomerTabRootListeners();

  return (
    <HomeStack.Navigator screenOptions={stackScreenOptions}>
      <HomeStack.Screen
        name="CustomerHomeRoot"
        component={CustomerHomeScreen}
        listeners={rootListeners}
      />
    </HomeStack.Navigator>
  );
}

function CustomerChefsStackNavigator() {
  const rootListeners = useCustomerTabRootListeners();

  return (
    <ChefsStack.Navigator screenOptions={stackScreenOptions}>
      <ChefsStack.Screen
        name="CustomerChefsRoot"
        component={DiscoverHomeChefsRouteScreen}
        listeners={rootListeners}
      />
    </ChefsStack.Navigator>
  );
}

/**
 * P25 owns these remaining tab roots. Their product screens stay on the
 * accepted account-status surface until their owning phases are authorized.
 */
function CustomerOrdersStackNavigator() {
  const rootListeners = useCustomerTabRootListeners();

  return (
    <OrdersStack.Navigator screenOptions={stackScreenOptions}>
      <OrdersStack.Screen
        name="CustomerOrdersRoot"
        component={CustomerAccountStatusScreen}
        listeners={rootListeners}
      />
    </OrdersStack.Navigator>
  );
}

function CustomerProfileStackNavigator() {
  const rootListeners = useCustomerTabRootListeners();

  return (
    <ProfileStack.Navigator screenOptions={stackScreenOptions}>
      <ProfileStack.Screen
        name="CustomerProfileRoot"
        component={CustomerAccountStatusScreen}
        listeners={rootListeners}
      />
    </ProfileStack.Navigator>
  );
}

function CustomerTabsNavigator() {
  const showBottomNav = useCustomerBottomNavReveal();
  const tabScreenListeners = React.useMemo(
    () => ({
      focus: showBottomNav,
      tabPress: showBottomNav,
    }),
    [showBottomNav],
  );

  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={tabScreenOptions}
      screenListeners={tabScreenListeners}
      tabBar={CustomerBottomTabBar}>
      <Tab.Screen
        name="Home"
        component={CustomerHomeStackNavigator}
        options={homeTabOptions}
      />
      <Tab.Screen
        name="Chefs"
        component={CustomerChefsStackNavigator}
        options={chefsTabOptions}
      />
      <Tab.Screen
        name="Orders"
        component={CustomerOrdersStackNavigator}
        options={ordersTabOptions}
      />
      <Tab.Screen
        name="Profile"
        component={CustomerProfileStackNavigator}
        options={profileTabOptions}
      />
    </Tab.Navigator>
  );
}

export function CustomerRootNavigator() {
  return (
    <CustomerBottomNavVisibilityProvider>
      <CustomerTabsNavigator />
    </CustomerBottomNavVisibilityProvider>
  );
}
