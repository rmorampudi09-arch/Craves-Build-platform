import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {borderWidth, colors, fontWeight, radius, spacing, textDefaults, typography} from '../../design/tokens';

export interface UnderlineTab<K extends string> {
  key: K;
  label: string;
  /** A small red number after the label; hidden when 0 or missing. */
  count?: number;
  accessibilityLabel?: string;
}

export interface UnderlineTabsProps<K extends string> {
  tabs: readonly UnderlineTab<K>[];
  selected: K;
  onSelect: (key: K) => void;
  /** true: equal-width tabs (two or three sections). false: tabs spread across the row (four or five lists). */
  fill?: boolean;
  accessibilityLabel?: string;
}

/** Section tabs with a red underline under the chosen one, the same on the customer and chef sides. */
export function UnderlineTabs<K extends string>({tabs, selected, onSelect, fill = false, accessibilityLabel}: UnderlineTabsProps<K>) {
  return (
    <View accessibilityLabel={accessibilityLabel} accessibilityRole="tablist" style={[styles.bar, !fill && styles.spread]}>
      {tabs.map(tab => {
        const on = tab.key === selected;
        return (
          <Pressable
            accessibilityLabel={tab.accessibilityLabel ?? tab.label}
            accessibilityRole="tab"
            accessibilityState={{selected: on}}
            key={tab.key}
            onPress={() => onSelect(tab.key)}
            style={[styles.tab, fill && styles.fillTab, on && styles.tabOn]}>
            <Text
              allowFontScaling={textDefaults.allowFontScaling}
              maxFontSizeMultiplier={1.3}
              numberOfLines={1}
              style={[styles.label, fill && styles.fillLabel, on && styles.labelOn]}>
              {tab.label}
            </Text>
            {tab.count ? (
              <View style={styles.badge}>
                <Text allowFontScaling={false} style={styles.badgeText}>
                  {tab.count > 99 ? '99+' : tab.count}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderBottomWidth: borderWidth.standard,
    borderBottomColor: colors.border,
  },
  spread: {justifyContent: 'space-between', paddingHorizontal: spacing.md},
  tab: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
    marginBottom: -borderWidth.standard,
  },
  fillTab: {flex: 1},
  tabOn: {borderBottomColor: colors.flameRedAccessible},
  label: {color: colors.textSecondary, fontSize: typography.small, fontWeight: fontWeight.semibold},
  fillLabel: {fontSize: typography.body},
  labelOn: {color: colors.flameRedAccessible, fontWeight: fontWeight.bold},
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.flameRedAccessible,
  },
  badgeText: {color: colors.white, fontSize: typography.tiny, fontWeight: fontWeight.bold},
});
