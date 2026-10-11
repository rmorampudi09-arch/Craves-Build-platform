import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {
  useNavigation,
  type CompositeNavigationProp,
} from '@react-navigation/native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {colors, fontWeight, spacing, typography} from '../../design/tokens';
import {ChefMenuScreen} from '../../features/chefMenu/screens/ChefMenuScreen';
import {ChefMealPlansScreen} from '../../features/chefSubscription/screens/ChefMealPlansScreen';
import {SegmentedControl} from '../../shared/components/SegmentedControl';
import type {ChefProductStackParamList, ChefTabParamList} from './types';

type ChefMenuNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<ChefTabParamList, 'Menu'>,
  NativeStackNavigationProp<ChefProductStackParamList>
>;

type MenuSegment = 'items' | 'plans';

const SEGMENTS = [
  {value: 'items', label: 'Items'},
  {value: 'plans', label: 'Meal plans'},
] as const;

export function ChefMenuTabScreen() {
  const navigation = useNavigation<ChefMenuNavigation>();
  const [segment, setSegment] = React.useState<MenuSegment>('items');
  const segmentControl = (
    <SegmentedControl
      accessibilityLabel="Menu section"
      onChange={setSegment}
      options={SEGMENTS}
      style={styles.segments}
      value={segment}
    />
  );

  return (
    <View style={styles.menuScreenBoundary}>
      {segment === 'items' ? (
        <ChefMenuScreen headerAccessory={segmentControl} />
      ) : (
        <ChefMealPlansScreen headerAccessory={segmentControl} />
      )}
      <View style={styles.menuCreateBar}>
        <Pressable
          accessibilityLabel={
            segment === 'items' ? 'Add new Chef menu item' : 'Add new plan'
          }
          accessibilityRole="button"
          onPress={() =>
            segment === 'items'
              ? navigation.navigate('ChefAddMenuItem')
              : navigation.navigate('ChefMealPlanEditor', {})
          }
          style={({pressed}) => [styles.menuCreateButton, pressed && styles.pressed]}>
          <Text style={styles.menuCreateButtonText}>
            {segment === 'items' ? '+ Add new item' : '+ Add new plan'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  menuScreenBoundary: {flex: 1},
  segments: {marginBottom: spacing.md},
  menuCreateBar: {
    backgroundColor: colors.white,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  menuCreateButton: {
    alignItems: 'center',
    backgroundColor: colors.flameRed,
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  menuCreateButtonText: {
    color: colors.white,
    fontSize: typography.button,
    fontWeight: fontWeight.bold,
  },
  pressed: {opacity: 0.65},
});
