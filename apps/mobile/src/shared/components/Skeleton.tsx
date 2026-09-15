import React from 'react';
import {StyleProp, StyleSheet, View, ViewStyle} from 'react-native';
import {colors, radius, spacing} from '../../design/tokens';

export interface SkeletonBlockProps {
  height?: number;
  width?: ViewStyle['width'];
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function SkeletonBlock({
  height = 16,
  width = '100%',
  borderRadius = radius.sm,
  style,
  testID,
}: SkeletonBlockProps) {
  return (
    <View
      accessible={false}
      importantForAccessibility="no"
      testID={testID}
      style={[styles.block, {height, width, borderRadius}, style]}
    />
  );
}

export interface SectionSkeletonProps {
  lines?: number;
  showTitle?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function SectionSkeleton({
  lines = 3,
  showTitle = true,
  style,
  testID,
}: SectionSkeletonProps) {
  return (
    <View
      accessible={false}
      importantForAccessibility="no"
      testID={testID}
      style={[styles.section, style]}>
      {showTitle ? <SkeletonBlock width="42%" height={20} /> : null}
      {Array.from({length: Math.max(0, lines)}, (_, index) => (
        <SkeletonBlock
          key={`line-${index}`}
          width={index === lines - 1 ? '72%' : '100%'}
          height={14}
        />
      ))}
    </View>
  );
}

export interface ListSkeletonProps {
  count?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function ListSkeleton({
  count = 4,
  style,
  testID,
}: ListSkeletonProps) {
  return (
    <View
      accessible={false}
      importantForAccessibility="no"
      testID={testID}
      style={[styles.list, style]}>
      {Array.from({length: Math.max(0, count)}, (_, index) => (
        <View key={`row-${index}`} style={styles.row}>
          <SkeletonBlock width={64} height={64} borderRadius={radius.md} />
          <View style={styles.rowText}>
            <SkeletonBlock width="68%" height={16} />
            <SkeletonBlock width="92%" height={13} />
            <SkeletonBlock width="48%" height={13} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: colors.surfaceMuted,
  },
  section: {
    gap: spacing.sm,
  },
  list: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowText: {
    flex: 1,
    gap: spacing.xs,
  },
});
