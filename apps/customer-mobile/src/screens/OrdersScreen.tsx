import React from 'react';
import { SafeAreaView, Text, View } from 'react-native';

const orders = [
  { id: 'CRV-1024', status: 'Cooking', eta: '18 mins' },
  { id: 'CRV-1023', status: 'Delivered', eta: 'Yesterday' }
];

export function OrdersScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <View style={{ padding: 20, gap: 12 }}>
        <Text style={{ fontSize: 24, fontWeight: '700' }}>Your orders</Text>
        {orders.map((order) => (
          <View key={order.id} style={{ backgroundColor: 'white', padding: 16, borderRadius: 16 }}>
            <Text style={{ fontWeight: '700' }}>{order.id}</Text>
            <Text>{order.status}</Text>
            <Text style={{ color: '#6b7280' }}>{order.eta}</Text>
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}
