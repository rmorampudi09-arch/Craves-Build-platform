import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {colors, fontWeight, spacing, typography} from '../../../design/tokens';
import {Button} from '../../../shared/components/Button';

// Placeholder so the plan list and "+ Add new plan" have a real destination; the editor task replaces it.
export function ChefMealPlanEditorScreen() {
  const navigation = useNavigation();
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          Meal plan editor
        </Text>
        <Text style={styles.message}>Creating and editing meal plans is coming soon.</Text>
        <Button label="Back" onPress={() => navigation.goBack()} variant="outline" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {flex: 1, backgroundColor: colors.surfaceMuted},
  content: {flex: 1, justifyContent: 'center', gap: spacing.md, padding: spacing.xl},
  title: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  message: {color: colors.textSecondary, fontSize: typography.body, textAlign: 'center'},
});
