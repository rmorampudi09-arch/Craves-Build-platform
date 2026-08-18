import React from 'react';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {useQueryClient} from '@tanstack/react-query';
import * as Location from 'expo-location';
import {useAppDispatch, useAppSelector} from '../store/hooks';
import {resolveReducedMotionAnimation} from '../../design/motion';
import {useReducedMotionPreference} from '../../design/reducedMotion';
import {fontWeight, typography} from '../../design/tokens';
import {CustomerCartScreen} from '../../features/cart/screens/CustomerCartScreen';
import {DiscoverHomeChefsRouteScreen} from '../../features/chefDiscovery/screens/DiscoverHomeChefsRouteScreen';
import {customerAddressesApi} from '../../features/customerAddresses/api/customerAddressesApi';
import {
  isCustomerAddressDeliveryReady,
  toCustomerBrowsingLocation,
} from '../../features/customerAddresses/domain/customerAddressContract';
import {CustomerAddressesRouteScreen} from '../../features/customerAddresses/screens/CustomerAddressesRouteScreen';
import {CustomerOrderDetailScreen} from '../../features/customerOrders/screens/CustomerOrderDetailScreen';
import {CustomerOrdersRouteScreen} from '../../features/customerOrders/screens/CustomerOrdersRouteScreen';
import {CustomerOrderTrackingScreen} from '../../features/customerOrders/screens/CustomerOrderTrackingScreen';
import {CustomerProfileEditRouteScreen} from '../../features/customerProfile/screens/CustomerProfileEditRouteScreen';
import {CustomerProfileRouteScreen} from '../../features/customerProfile/screens/CustomerProfileRouteScreen';
import {
  CustomerSettingsAboutScreen,
  CustomerSettingsAppearanceScreen,
  CustomerSettingsChangePasswordScreen,
  CustomerSettingsLanguageScreen,
  CustomerSettingsLegalScreen,
  CustomerSettingsNotificationsScreen,
  CustomerSettingsPrivacySecurityScreen,
  CustomerSettingsReferralScreen,
  CustomerSettingsShareScreen,
  CustomerSettingsSubscriptionScreen,
} from '../../features/customerSettings/screens/CustomerSettingsChildScreens';
import {CustomerSettingsRouteScreen} from '../../features/customerSettings/screens/CustomerSettingsRouteScreen';
import {CustomerHelpSupportRouteScreen} from '../../features/customerSupport/screens/CustomerHelpSupportRouteScreen';
import {CustomerDishDetailScreen} from '../../features/dishDetail/screens/CustomerDishDetailScreen';
import {CustomerDishIngredientsScreen} from '../../features/dishDetail/screens/CustomerDishIngredientsScreen';
import {CustomerFilterSortScreen} from '../../features/discoveryFilters/screens/CustomerFilterSortScreen';
import {CustomerHomeSearchScreen} from '../../features/discoverySearch/screens/CustomerHomeSearchScreen';
import {CustomerFavoritesRouteScreen} from '../../features/favorites/screens/CustomerFavoritesRouteScreen';
import {CustomerHomeRouteScreen} from '../../features/home/screens/CustomerHomeRouteScreen';
import {CustomerKitchenDishesScreen} from '../../features/kitchenProfile/screens/CustomerKitchenDishesScreen';
import {CustomerKitchenProfileScreen} from '../../features/kitchenProfile/screens/CustomerKitchenProfileScreen';
import {CustomerNotificationsRouteScreen} from '../../features/notifications/screens/CustomerNotificationsRouteScreen';
import {CustomerPaymentMethodsRouteScreen} from '../../features/payment/screens/CustomerPaymentMethodsRouteScreen';
import {invalidateCustomerLocationDependentQueries} from '../../features/customerShell/query/customerLocationReconciliation';
import {
  loadPersistedCustomerLocation,
  persistCustomerLocation,
} from '../../features/customerShell/state/customerLocationPersistence';
import {
  customerShellActions,
  type CustomerBrowsingLocation,
} from '../../features/customerShell/state/customerShellSlice';
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
const LIVE_LOCATION_ID = 'LIVE_GPS';
const SAVED_ADDRESS_MATCH_RADIUS_METERS = 100;

interface TabIconProps {
  color: string;
  size: number;
}

function HomeTabIcon({color, size}: TabIconProps) {
  return <Icon name={homeTab.icon} color={color} size={size} surface={false} />;
}
function ChefsTabIcon({color, size}: TabIconProps) {
  return <Icon name={chefsTab.icon} color={color} size={size} surface={false} />;
}
function OrdersTabIcon({color, size}: TabIconProps) {
  return <Icon name={ordersTab.icon} color={color} size={size} surface={false} />;
}
function ProfileTabIcon({color, size}: TabIconProps) {
  return <Icon name={profileTab.icon} color={color} size={size} surface={false} />;
}

const tabScreenOptions = {
  headerShown: false,
  ...CUSTOMER_TAB_STATE_OPTIONS,
  tabBarActiveTintColor: CUSTOMER_TAB_ACTIVE_COLOR,
  tabBarInactiveTintColor: CUSTOMER_TAB_INACTIVE_COLOR,
  tabBarHideOnKeyboard: true,
  tabBarIconStyle: {
    marginTop: 0,
    marginBottom: 0,
  },
  tabBarLabelStyle: {
    fontSize: typography.tiny,
    fontWeight: fontWeight.semibold,
    marginTop: 1,
    marginBottom: 0,
  },
  tabBarItemStyle: {
    height: 72,
    paddingVertical: 0,
    justifyContent: 'center',
  },
  tabBarStyle: {
    height: 72,
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    paddingTop: 0,
    paddingBottom: 0,
    elevation: 0,
    shadowColor: 'transparent',
    shadowOffset: {width: 0, height: 0},
    shadowRadius: 0,
    shadowOpacity: 0,
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

function useCustomerStackScreenOptions() {
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

function useCustomerTabRootListeners() {
  const showBottomNav = useCustomerBottomNavReveal();
  return React.useMemo(() => ({focus: showBottomNav}), [showBottomNav]);
}

function CustomerLaunchLocationResolver() {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const attemptedIdentity = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!identityId || attemptedIdentity.current === identityId) return;
    attemptedIdentity.current = identityId;
    let cancelled = false;

    const applyLocation = async (location: CustomerBrowsingLocation) => {
      if (cancelled) return false;
      dispatch(customerShellActions.locationSelected(location));
      await persistCustomerLocation(identityId, location).catch(() => undefined);
      await invalidateCustomerLocationDependentQueries(queryClient);
      return true;
    };

    const selectSavedFallback = async () => {
      const addresses = await customerAddressesApi.list();
      const fallback =
        addresses.find(
          candidate => candidate.isDefault && isCustomerAddressDeliveryReady(candidate),
        ) ?? addresses.find(isCustomerAddressDeliveryReady);
      const savedLocation = fallback ? toCustomerBrowsingLocation(fallback) : null;
      if (!savedLocation) return false;
      return applyLocation(savedLocation);
    };

    const resolveGpsLocation = async () => {
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const latitude = current.coords.latitude;
      const longitude = current.coords.longitude;
      const recommendation = await customerAddressesApi.recommendLocation(
        latitude,
        longitude,
        SAVED_ADDRESS_MATCH_RADIUS_METERS,
      );

      if (
        recommendation.locationType === 'SAVED_ADDRESS' &&
        recommendation.selectedSavedAddress &&
        isCustomerAddressDeliveryReady(recommendation.selectedSavedAddress)
      ) {
        const savedLocation = toCustomerBrowsingLocation(
          recommendation.selectedSavedAddress,
        );
        if (savedLocation) {
          await applyLocation(savedLocation);
        }
        return;
      }

      let displayName = 'Current location';
      try {
        const resolved = await customerAddressesApi.reverseGeocode(latitude, longitude);
        displayName =
          resolved.area ||
          resolved.city ||
          resolved.district ||
          resolved.formattedAddress;
      } catch {
        // Discovery still works from the live coordinates if the written label is unavailable.
      }

      await applyLocation({
        kind: 'LIVE_GPS',
        addressId: LIVE_LOCATION_ID,
        label: 'Current location',
        displayName,
        latitude,
        longitude,
      });
    };

    const resolveLocation = async () => {
      const persisted = await loadPersistedCustomerLocation(identityId);
      if (cancelled) return;

      if (persisted?.kind === 'SAVED_ADDRESS') {
        await applyLocation(persisted);
        return;
      }

      let permission = await Location.getForegroundPermissionsAsync();

      if (
        persisted?.kind === 'LIVE_GPS' &&
        permission.status === Location.PermissionStatus.GRANTED
      ) {
        await applyLocation(persisted);
        return;
      }

      if (
        permission.status === Location.PermissionStatus.UNDETERMINED &&
        permission.canAskAgain
      ) {
        permission = await Location.requestForegroundPermissionsAsync();
      }

      if (permission.status !== Location.PermissionStatus.GRANTED) {
        await selectSavedFallback();
        return;
      }

      await resolveGpsLocation();
    };

    resolveLocation().catch(() => {
      if (!cancelled) selectSavedFallback().catch(() => undefined);
    });

    return () => {
      cancelled = true;
    };
  }, [dispatch, identityId, queryClient]);

  return null;
}

function CustomerHomeStackNavigator() {
  const rootListeners = useCustomerTabRootListeners();
  const stackScreenOptions = useCustomerStackScreenOptions();
  return (
    <HomeStack.Navigator screenOptions={stackScreenOptions}>
      <HomeStack.Screen name="CustomerHomeRoot" component={CustomerHomeRouteScreen} listeners={rootListeners} />
      <HomeStack.Screen name="CustomerHomeSearch" component={CustomerHomeSearchScreen} />
      <HomeStack.Screen name="CustomerNotifications" component={CustomerNotificationsRouteScreen} />
      <HomeStack.Screen name="CustomerSettingsSubscription" component={CustomerSettingsSubscriptionScreen} />
      <HomeStack.Screen name="CustomerFilterSort" component={CustomerFilterSortScreen} />
      <HomeStack.Screen name="CustomerDishDetail" component={CustomerDishDetailScreen} />
      <HomeStack.Screen name="CustomerDishIngredients" component={CustomerDishIngredientsScreen} />
      <HomeStack.Screen name="CustomerKitchenProfile" component={CustomerKitchenProfileScreen} />
      <HomeStack.Screen name="CustomerKitchenDishes" component={CustomerKitchenDishesScreen} />
      <HomeStack.Screen name="CustomerOrderDetail" component={CustomerOrderDetailScreen} />
      <HomeStack.Screen name="CustomerOrderTracking" component={CustomerOrderTrackingScreen} />
      <HomeStack.Screen name="CustomerCart" component={CustomerCartScreen} />
      <HomeStack.Screen name="CustomerPaymentMethods" component={CustomerPaymentMethodsRouteScreen} />
    </HomeStack.Navigator>
  );
}

function CustomerChefsStackNavigator() {
  const rootListeners = useCustomerTabRootListeners();
  const stackScreenOptions = useCustomerStackScreenOptions();
  return (
    <ChefsStack.Navigator screenOptions={stackScreenOptions}>
      <ChefsStack.Screen name="CustomerChefsRoot" component={DiscoverHomeChefsRouteScreen} listeners={rootListeners} />
      <ChefsStack.Screen name="CustomerNotifications" component={CustomerNotificationsRouteScreen} />
      <ChefsStack.Screen name="CustomerFilterSort" component={CustomerFilterSortScreen} />
      <ChefsStack.Screen name="CustomerDishDetail" component={CustomerDishDetailScreen} />
      <ChefsStack.Screen name="CustomerDishIngredients" component={CustomerDishIngredientsScreen} />
      <ChefsStack.Screen name="CustomerKitchenProfile" component={CustomerKitchenProfileScreen} />
      <ChefsStack.Screen name="CustomerKitchenDishes" component={CustomerKitchenDishesScreen} />
      <ChefsStack.Screen name="CustomerOrderDetail" component={CustomerOrderDetailScreen} />
      <ChefsStack.Screen name="CustomerOrderTracking" component={CustomerOrderTrackingScreen} />
      <ChefsStack.Screen name="CustomerCart" component={CustomerCartScreen} />
      <ChefsStack.Screen name="CustomerPaymentMethods" component={CustomerPaymentMethodsRouteScreen} />
    </ChefsStack.Navigator>
  );
}

function CustomerOrdersStackNavigator() {
  const rootListeners = useCustomerTabRootListeners();
  const stackScreenOptions = useCustomerStackScreenOptions();
  return (
    <OrdersStack.Navigator screenOptions={stackScreenOptions}>
      <OrdersStack.Screen name="CustomerOrdersRoot" component={CustomerOrdersRouteScreen} listeners={rootListeners} />
      <OrdersStack.Screen name="CustomerNotifications" component={CustomerNotificationsRouteScreen} />
      <OrdersStack.Screen name="CustomerDishDetail" component={CustomerDishDetailScreen} />
      <OrdersStack.Screen name="CustomerDishIngredients" component={CustomerDishIngredientsScreen} />
      <OrdersStack.Screen name="CustomerKitchenProfile" component={CustomerKitchenProfileScreen} />
      <OrdersStack.Screen name="CustomerKitchenDishes" component={CustomerKitchenDishesScreen} />
      <OrdersStack.Screen name="CustomerOrderDetail" component={CustomerOrderDetailScreen} />
      <OrdersStack.Screen name="CustomerOrderTracking" component={CustomerOrderTrackingScreen} />
      <OrdersStack.Screen name="CustomerCart" component={CustomerCartScreen} />
      <OrdersStack.Screen name="CustomerPaymentMethods" component={CustomerPaymentMethodsRouteScreen} />
    </OrdersStack.Navigator>
  );
}

/** P75 keeps every Settings child route inside the existing Profile stack. */
function CustomerProfileStackNavigator() {
  const rootListeners = useCustomerTabRootListeners();
  const stackScreenOptions = useCustomerStackScreenOptions();
  return (
    <ProfileStack.Navigator screenOptions={stackScreenOptions}>
      <ProfileStack.Screen name="CustomerProfileRoot" component={CustomerProfileRouteScreen} listeners={rootListeners} />
      <ProfileStack.Screen name="CustomerProfileEdit" component={CustomerProfileEditRouteScreen} />
      <ProfileStack.Screen name="CustomerAddresses" component={CustomerAddressesRouteScreen} />
      <ProfileStack.Screen name="CustomerFavorites" component={CustomerFavoritesRouteScreen} />
      <ProfileStack.Screen name="CustomerNotifications" component={CustomerNotificationsRouteScreen} />
      <ProfileStack.Screen name="CustomerSettings" component={CustomerSettingsRouteScreen} />
      <ProfileStack.Screen name="CustomerSettingsNotifications" component={CustomerSettingsNotificationsScreen} />
      <ProfileStack.Screen name="CustomerSettingsPrivacySecurity" component={CustomerSettingsPrivacySecurityScreen} />
      <ProfileStack.Screen name="CustomerSettingsChangePassword" component={CustomerSettingsChangePasswordScreen} />
      <ProfileStack.Screen name="CustomerSettingsLanguage" component={CustomerSettingsLanguageScreen} />
      <ProfileStack.Screen name="CustomerSettingsAppearance" component={CustomerSettingsAppearanceScreen} />
      <ProfileStack.Screen name="CustomerSettingsAbout" component={CustomerSettingsAboutScreen} />
      <ProfileStack.Screen name="CustomerSettingsShare" component={CustomerSettingsShareScreen} />
      <ProfileStack.Screen name="CustomerSettingsReferral" component={CustomerSettingsReferralScreen} />
      <ProfileStack.Screen name="CustomerSettingsSupport" component={CustomerHelpSupportRouteScreen} />
      <ProfileStack.Screen name="CustomerSettingsSubscription" component={CustomerSettingsSubscriptionScreen} />
      <ProfileStack.Screen name="CustomerSettingsLegal" component={CustomerSettingsLegalScreen} />
      <ProfileStack.Screen name="CustomerOrderDetail" component={CustomerOrderDetailScreen} />
      <ProfileStack.Screen name="CustomerOrderTracking" component={CustomerOrderTrackingScreen} />
      <ProfileStack.Screen name="CustomerDishDetail" component={CustomerDishDetailScreen} />
      <ProfileStack.Screen name="CustomerDishIngredients" component={CustomerDishIngredientsScreen} />
      <ProfileStack.Screen name="CustomerKitchenProfile" component={CustomerKitchenProfileScreen} />
      <ProfileStack.Screen name="CustomerKitchenDishes" component={CustomerKitchenDishesScreen} />
      <ProfileStack.Screen name="CustomerCart" component={CustomerCartScreen} />
      <ProfileStack.Screen name="CustomerPaymentMethods" component={CustomerPaymentMethodsRouteScreen} />
    </ProfileStack.Navigator>
  );
}

function CustomerTabsNavigator() {
  const showBottomNav = useCustomerBottomNavReveal();
  const tabScreenListeners = React.useMemo(
    () => ({focus: showBottomNav, tabPress: showBottomNav}),
    [showBottomNav],
  );
  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={tabScreenOptions}
      screenListeners={tabScreenListeners}
      tabBar={CustomerBottomTabBar}>
      <Tab.Screen name="Home" component={CustomerHomeStackNavigator} options={homeTabOptions} />
      <Tab.Screen name="Chefs" component={CustomerChefsStackNavigator} options={chefsTabOptions} />
      <Tab.Screen name="Orders" component={CustomerOrdersStackNavigator} options={ordersTabOptions} />
      <Tab.Screen name="Profile" component={CustomerProfileStackNavigator} options={profileTabOptions} />
    </Tab.Navigator>
  );
}

export function CustomerRootNavigator() {
  return (
    <CustomerBottomNavVisibilityProvider>
      <CustomerLaunchLocationResolver />
      <CustomerTabsNavigator />
    </CustomerBottomNavVisibilityProvider>
  );
}