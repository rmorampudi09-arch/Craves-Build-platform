import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthProvider';
import { AddressFormScreen } from '../screens/AddressFormScreen';
import { AddressListScreen } from '../screens/AddressListScreen';
import { CartScreen } from '../screens/CartScreen';
import { ChefApplicationStatusScreen } from '../screens/ChefApplicationStatusScreen';
import { ChefModeScreen } from '../screens/ChefModeScreen';
import { ChefWorkspacePendingScreen } from '../screens/ChefWorkspacePendingScreen';
import { DeliveryTrackingScreen } from '../screens/DeliveryTrackingScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { MobileCheckoutScreen } from '../screens/MobileCheckoutScreen';
import { MobilePaymentScreen } from '../screens/MobilePaymentScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { OrderDetailsScreen } from '../screens/OrderDetailsScreen';
import { OrdersScreen } from '../screens/OrdersScreen';
import { PhoneOtpScreen } from '../screens/PhoneOtpScreen';
import { TrackingLookupScreen } from '../screens/TrackingLookupScreen';
import { theme } from '../theme';

export type RootStackParamList = {
  SignIn: undefined;
  Home: undefined;
  Orders: undefined;
  OrderDetails: { orderId: string };
  Notifications: undefined;
  Addresses: undefined;
  AddressForm: { addressId?: string };
  Cart: { menuItemId?: string; quantity?: number } | undefined;
  MobileCheckout: undefined;
  MobilePayment: { checkoutId: string };
  TrackingLookup: undefined;
  DeliveryTracking: { orderId: string };
  ChefMode: undefined;
  ChefApplicationStatus: undefined;
  ChefKitchen: undefined;
  ChefOrders: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
export function RootNavigator() {
  const { session, initializing } = useAuth();
  if (initializing) return <View style={styles.loading}><ActivityIndicator size="large" color={theme.colors.gold} /></View>;
  return <NavigationContainer><Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>{session ? <><Stack.Screen name="Home" component={HomeScreen} /><Stack.Screen name="Orders" component={OrdersScreen} /><Stack.Screen name="OrderDetails" component={OrderDetailsScreen} /><Stack.Screen name="Notifications" component={NotificationsScreen} /><Stack.Screen name="Addresses" component={AddressListScreen} /><Stack.Screen name="AddressForm" component={AddressFormScreen} /><Stack.Screen name="Cart" component={CartScreen} /><Stack.Screen name="MobileCheckout" component={MobileCheckoutScreen} /><Stack.Screen name="MobilePayment" component={MobilePaymentScreen} /><Stack.Screen name="TrackingLookup" component={TrackingLookupScreen} /><Stack.Screen name="DeliveryTracking" component={DeliveryTrackingScreen} /><Stack.Screen name="ChefMode" component={ChefModeScreen} /><Stack.Screen name="ChefApplicationStatus" component={ChefApplicationStatusScreen} /><Stack.Screen name="ChefKitchen" component={ChefWorkspacePendingScreen} /><Stack.Screen name="ChefOrders" component={ChefWorkspacePendingScreen} /></> : <Stack.Screen name="SignIn" component={PhoneOtpScreen} />}</Stack.Navigator></NavigationContainer>;
}
const styles = StyleSheet.create({ loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background } });
