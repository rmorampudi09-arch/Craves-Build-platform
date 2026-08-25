import React from 'react';
import { SafeAreaView, ScrollView, Text, View } from 'react-native';

const featuredRails = [
  'Top rated near Madhapur',
  'Homely lunch under ₹199',
  'Healthy high-protein picks',
  'Pure veg kitchens'
];

export function HomeScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff7ed' }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <Text style={{ fontSize: 28, fontWeight: '700', color: '#7c2d12' }}>Craves</Text>
        <Text style={{ fontSize: 16, color: '#9a3412' }}>Fresh home-chef meals delivered across Hyderabad.</Text>
        {featuredRails.map((rail) => (
          <View key={rail} style={{ backgroundColor: 'white', borderRadius: 16, padding: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', color: '#1f2937' }}>{rail}</Text>
            <Text style={{ marginTop: 8, color: '#6b7280' }}>Personalized rail ready for API binding.</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
