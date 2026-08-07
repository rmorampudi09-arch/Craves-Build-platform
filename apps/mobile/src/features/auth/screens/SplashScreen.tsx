import React from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {colors, spacing} from '../../../design/tokens';

export function SplashScreen() {
  return <SafeAreaView style={styles.root}>
    <View style={styles.center}>
      <Text style={styles.brand}>craves</Text>
      <Text style={styles.tagline}>Homemade food, closer to home.</Text>
      <ActivityIndicator color={colors.flameRed} size="large" style={styles.loader}/>
    </View>
  </SafeAreaView>;
}
const styles = StyleSheet.create({root:{flex:1,backgroundColor:colors.cream},center:{flex:1,alignItems:'center',justifyContent:'center',padding:spacing.xl},brand:{fontSize:44,fontWeight:'800',color:colors.espressoBrown,letterSpacing:-1.5},tagline:{marginTop:8,fontSize:15,color:colors.mutedText},loader:{marginTop:32}});
