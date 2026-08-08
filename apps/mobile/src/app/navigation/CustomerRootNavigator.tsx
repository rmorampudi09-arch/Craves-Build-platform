import React from 'react';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {colors, fontWeight, spacing, typography} from '../../design/tokens';
import {CustomerCartScreen} from '../../features/cart/screens/CustomerCartScreen';
import {DiscoverHomeChefsRouteScreen} from '../../features/chefDiscovery/screens/DiscoverHomeChefsRouteScreen';
import {CustomerAddressesRouteScreen} from '../../features/customerAddresses/screens/CustomerAddressesRouteScreen';
import {CustomerOrderDetailScreen} from '../../features/customerOrders/screens/CustomerOrderDetailScreen';
import {CustomerOrdersRouteScreen} from '../../features/customerOrders/screens/CustomerOrdersRouteScreen';
import {CustomerOrderTrackingScreen} from '../../features/customerOrders/screens/CustomerOrderTrackingScreen';
import {CustomerProfileEditRouteScreen} from '../../features/customerProfile/screens/CustomerProfileEditRouteScreen';
import {CustomerProfileRouteScreen} from '../../features/customerProfile/screens/CustomerProfileRouteScreen';
import {CustomerDishDetailScreen} from '../../features/dishDetail/screens/CustomerDishDetailScreen';
import {CustomerDishIngredientsScreen} from '../../features/dishDetail/screens/CustomerDishIngredientsScreen';
import {CustomerFilterSortScreen} from '../../features/discoveryFilters/screens/CustomerFilterSortScreen';
import {CustomerFavoritesRouteScreen} from '../../features/favorites/screens/CustomerFavoritesRouteScreen';
import {CustomerHomeRouteScreen} from '../../features/home/screens/CustomerHomeRouteScreen';
import {CustomerKitchenDishesScreen} from '../../features/kitchenProfile/screens/CustomerKitchenDishesScreen';
import {CustomerKitchenProfileScreen} from '../../features/kitchenProfile/screens/CustomerKitchenProfileScreen';
import {CustomerNotificationsRouteScreen} from '../../features/notifications/screens/CustomerNotificationsRouteScreen';
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
        component={CustomerHomeRouteScreen}
        listeners={rootListeners}
      />
      <HomeStack.Screen
        name="CustomerFilterSort"
        component={CustomerFilterSortScreen}
      />
      <HomeStack.Screen
        name="CustomerDishDetail"
        component={CustomerDishDetailScreen}
      />
      <HomeStack.Screen
        name="CustomerDishIngredients"
        component={CustomerDishIngredientsScreen}
      />
      <HomeStack.Screen
        name="CustomerKitchenProfile"
        component={CustomerKitchenProfileScreen}
      />
      <HomeStack.Screen
        name="CustomerKitchenDishes"
        component={CustomerKitchenDishesScreen}
      />
      <HomeStack.Screen name="CustomerCart" component={CustomerCartScreen} />
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
      <ChefsStack.Screen
        name="CustomerFilterSort"
        component={CustomerFilterSortScreen}
      />
      <ChefsStack.Screen
        name="CustomerDishDetail"
        component={CustomerDishDetailScreen}
      />
      <ChefsStack.Screen
        name="CustomerDishIngredients"
        component={CustomerDishIngredientsScreen}
      />
      <ChefsStack.Screen
        name="CustomerKitchenProfile"
        component={CustomerKitchenProfileScreen}
      />
      <ChefsStack.Screen
        name="CustomerKitchenDishes"
        component={CustomerKitchenDishesScreen}
      />
      <ChefsStack.Screen name="CustomerCart" component={CustomerCartScreen} />
    </ChefsStack.Navigator>
  );
}

/** P55 adds typed Order Detail and Delivery Tracking child routes. */
function CustomerOrdersStackNavigator() {
  const rootListeners = useCustomerTabRootListeners();

  return (
    <OrdersStack.Navigator screenOptions={stackScreenOptions}>
      <OrdersStack.Screen
        name="CustomerOrdersRoot"
        component={CustomerOrdersRouteScreen}
        listeners={rootListeners}
      />
      <OrdersStack.Screen
        name="CustomerOrderDetail"
        component={CustomerOrderDetailScreen}
      />
      <OrdersStack.Screen
        name="CustomerOrderTracking"
        component={CustomerOrderTrackingScreen}
      />
      <OrdersStack.Screen name="CustomerCart" component={CustomerCartScreen} />
    </OrdersStack.Navigator>
  );
}

/** P66 adds My Addresses after the P65 shared Edit Profile route. */
function CustomerProfileStackNavigator() {
  const rootListeners = useCustomerTabRootListeners();

  return (
    <ProfileStack.Navigator screenOptions={stackScreenOptions}>
      <ProfileStack.Screen
        name="CustomerProfileRoot"
        component={CustomerProfileRouteScreen}
        listeners={rootListeners}
      />
      <ProfileStack.Screen
        name="CustomerProfileEdit"
        component={CustomerProfileEditRouteScreen}
      />
      <ProfileStack.Screen
        name="CustomerAddresses"
        component={CustomerAddressesRouteScreen}
      />
      <ProfileStack.Screen
        name="CustomerFavorites"
        component={CustomerFavoritesRouteScreen}
      />
      <ProfileStack.Screen
        name="CustomerNotifications"
        component={CustomerNotificationsRouteScreen}
      />
      <ProfileStack.Screen
        name="CustomerOrderDetail"
        component={CustomerOrderDetailScreen}
      />
      <ProfileStack.Screen
        name="CustomerOrderTracking"
        component={CustomerOrderTrackingScreen}
      />
      <ProfileStack.Screen
        name="CustomerDishDetail"
        component={CustomerDishDetailScreen}
      />
      <ProfileStack.Screen
        name="CustomerDishIngredients"
        component={CustomerDishIngredientsScreen}
      />
      <ProfileStack.Screen
        name="CustomerKitchenProfile"
        component={CustomerKitchenProfileScreen}
      />
      <ProfileStack.Screen
        name="CustomerKitchenDishes"
        component={CustomerKitchenDishesScreen}
      />
      <ProfileStack.Screen name="CustomerCart" component={CustomerCartScreen} />
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
