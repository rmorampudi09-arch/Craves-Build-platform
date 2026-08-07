import React from 'react';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {colors, fontWeight, spacing, typography} from '../../design/tokens';
import {CustomerAccountStatusScreen} from '../../features/auth/screens/CustomerAccountStatusScreen';
import {Icon} from '../../shared/components/Icon';
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

/**
 * P25 owns the root shell, not the later marketplace product screens. Reusing
 * the accepted account-status surface keeps the branch honest and functional
 * until each tab root is replaced by its owning product phase.
 */
function CustomerHomeStackNavigator() {
  return (
    <HomeStack.Navigator screenOptions={stackScreenOptions}>
      <HomeStack.Screen name="CustomerHomeRoot" component={CustomerAccountStatusScreen} />
    </HomeStack.Navigator>
  );
}

function CustomerChefsStackNavigator() {
  return (
    <ChefsStack.Navigator screenOptions={stackScreenOptions}>
      <ChefsStack.Screen name="CustomerChefsRoot" component={CustomerAccountStatusScreen} />
    </ChefsStack.Navigator>
  );
}

function CustomerOrdersStackNavigator() {
  return (
    <OrdersStack.Navigator screenOptions={stackScreenOptions}>
      <OrdersStack.Screen name="CustomerOrdersRoot" component={CustomerAccountStatusScreen} />
    </OrdersStack.Navigator>
  );
}

function CustomerProfileStackNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={stackScreenOptions}>
      <ProfileStack.Screen name="CustomerProfileRoot" component={CustomerAccountStatusScreen} />
    </ProfileStack.Navigator>
  );
}

export function CustomerRootNavigator() {
  return (
    <Tab.Navigator initialRouteName="Home" screenOptions={tabScreenOptions}>
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
