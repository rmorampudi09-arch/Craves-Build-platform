import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthProvider';
import { DeliveryTrackingScreen } from '../screens/DeliveryTrackingScreen';
import { HomeScreen } from '../screens/HomeScreen';
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
  TrackingLookup: undefined;
  DeliveryTracking: { orderId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();
export function RootNavigator() {
  const { session, initializing } = useAuth();
  if (initializing) return <View style={styles.loading}><ActivityIndicator size="large" color={theme.colors.gold} /></View>;
  return <NavigationContainer><Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>{session ? <><Stack.Screen name="Home" component={HomeScreen} /><Stack.Screen name="Orders" component={OrdersScreen} /><Stack.Screen name="OrderDetails" component={OrderDetailsScreen} /><Stack.Screen name="Notifications" component={NotificationsScreen} /><Stack.Screen name="TrackingLookup" component={TrackingLookupScreen} /><Stack.Screen name="DeliveryTracking" component={DeliveryTrackingScreen} /></> : <Stack.Screen name="SignIn" component={PhoneOtpScreen} />}</Stack.Navigator></NavigationContainer>;
}
const styles = StyleSheet.create({ loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background } });
