import React from 'react';
import {Modal, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {colors, fontWeight, radius, spacing, textDefaults, typography} from '../../../../design/tokens';

export interface ChefSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children?: React.ReactNode;
}

/** White bottom sheet over a dimmed screen. Tapping the dim area or Android back closes it. */
export function ChefSheet({visible, onClose, title, children}: ChefSheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="slide" onRequestClose={onClose} statusBarTranslucent transparent visible={visible}>
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel="Close"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.scrim}
        />
        <View
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          style={[styles.sheet, {paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.xs}]}>
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
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {flex: 1, justifyContent: 'flex-end'},
  // Espresso at reduced opacity: the scrim is its own layer so the sheet itself stays opaque.
  scrim: {position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0, backgroundColor: colors.espresso, opacity: 0.42},
  sheet: {
    maxHeight: '88%',
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
