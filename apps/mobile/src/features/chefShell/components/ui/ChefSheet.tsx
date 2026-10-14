import React from 'react';
import {ScrollView, StyleSheet, Text, View, useWindowDimensions} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {colors, fontWeight, radius, spacing, textDefaults, typography} from '../../../../design/tokens';
import {SheetModal} from '../../../../shared/components/SheetModal';

export interface ChefSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children?: React.ReactNode;
  /** Pinned under the scrolling body, so a main action stays on screen however tall the body is. */
  footer?: React.ReactNode;
}

/** White bottom sheet over a dimmed screen. Tapping the dim area or Android back closes it. */
export function ChefSheet({visible, onClose, title, children, footer}: ChefSheetProps) {
  const insets = useSafeAreaInsets();
  const {height} = useWindowDimensions();
  return (
    <SheetModal onRequestClose={onClose} visible={visible}>
      <View
        accessibilityViewIsModal
        onAccessibilityEscape={onClose}
        style={[styles.sheet, {maxHeight: height * 0.88, paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.xs}]}>
        <View style={styles.grab} />
        <Text
          accessibilityRole="header"
          allowFontScaling={textDefaults.allowFontScaling}
          style={styles.title}>
          {title}
        </Text>
        <ScrollView
          bounces={false}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
        {footer}
      </View>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    gap: spacing.sm,
    paddingTop: spacing.xs,
    paddingHorizontal: spacing.md,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.white,
  },
  grab: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    marginBottom: spacing.xxs,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  title: {color: colors.textPrimary, fontSize: typography.heading, fontWeight: fontWeight.bold},
  body: {gap: spacing.sm},
});
