import React from 'react';
import { SafeAreaView, ScrollView, StatusBar, Text, View } from 'react-native';

const screens = ['Auth', 'Home', 'Kitchen Details', 'Dish Details', 'Cart', 'Checkout', 'Orders', 'Tracking', 'Notifications', 'Profile', 'Wishlist'];
const notifications = ['Your order is out for delivery', 'New chef special dropped nearby', 'Wallet coins are ready to redeem'];

export default function App() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a' }}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={{ padding: 24, gap: 24 }}>
        <View>
          <Text style={{ color: '#7dd3fc', fontSize: 12, fontWeight: '700', letterSpacing: 2 }}>CRAVES MOBILE MVP</Text>
          <Text style={{ color: '#ffffff', fontSize: 28, fontWeight: '700', marginTop: 8 }}>Customer app launch shell</Text>
          <Text style={{ color: '#cbd5e1', marginTop: 8, lineHeight: 22 }}>
            React Native MVP foundation for customer auth, discovery, checkout, order tracking and push-led retention.
          </Text>
        </View>

        <View style={{ backgroundColor: '#111827', borderRadius: 24, padding: 20, gap: 12 }}>
          <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '600' }}>MVP screens</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {screens.map((screen) => (
              <View key={screen} style={{ backgroundColor: '#1f2937', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 }}>
                <Text style={{ color: '#e2e8f0', fontWeight: '500' }}>{screen}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ backgroundColor: '#111827', borderRadius: 24, padding: 20, gap: 12 }}>
          <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '600' }}>Push notifications</Text>
          {notifications.map((item) => (
            <View key={item} style={{ backgroundColor: '#1e293b', borderRadius: 16, padding: 14 }}>
              <Text style={{ color: '#f8fafc' }}>{item}</Text>
            </View>
          ))}
          <Text style={{ color: '#7dd3fc', fontWeight: '600' }}>Deep links: craves://app</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
