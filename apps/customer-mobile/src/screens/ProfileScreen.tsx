import React from 'react';
import { SafeAreaView, Text, View } from 'react-native';

export function ProfileScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={{ padding: 20, gap: 10 }}>
        <Text style={{ fontSize: 24, fontWeight: '700' }}>Profile</Text>
        <Text style={{ color: '#374151' }}>Manage addresses, rewards, referrals and notification preferences.</Text>
      </View>
    </SafeAreaView>
  );
}
