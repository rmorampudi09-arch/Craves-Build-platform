import React from 'react';
import { SafeAreaView, Text, TextInput, View } from 'react-native';

export function SearchScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={{ padding: 20, gap: 12 }}>
        <Text style={{ fontSize: 24, fontWeight: '700' }}>Search dishes & cuisines</Text>
        <TextInput
          placeholder="Search biryani, millet bowl, party trays..."
          style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12, padding: 14 }}
        />
        <Text style={{ color: '#6b7280' }}>Trending: Andhra meals, veg thali, haleem, keto bowls</Text>
      </View>
    </SafeAreaView>
  );
}
