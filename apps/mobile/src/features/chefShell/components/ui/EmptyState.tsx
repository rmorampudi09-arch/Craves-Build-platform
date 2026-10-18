import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {colors, fontWeight, spacing, textDefaults, typography} from '../../../../design/tokens';
import {EmptyIllustration, type EmptyIllustrationName} from '../../../../shared/components/EmptyIllustration';

export interface EmptyStateProps {
  illustration: EmptyIllustrationName;
  title: string;
  message: string;
  /** Drawing width; 200 for a whole page, smaller where the empty sits under other content. */
  width?: number;
  /** Shown between the drawing and the title, e.g. the "Coming soon" chip. */
  badge?: React.ReactNode;
  /** Buttons, stretched full width under the message. */
  children?: React.ReactNode;
}

/** The approved empty look on the chef side: drawing, title, one line of help, then buttons. No card around it. */
export function EmptyState({illustration, title, message, width = 200, badge, children}: EmptyStateProps) {
  return (
    <View style={styles.root}>
      <EmptyIllustration name={illustration} width={width} />
      {badge ? <View style={styles.badge}>{badge}</View> : null}
      <Text accessibilityRole="header" allowFontScaling={textDefaults.allowFontScaling} style={styles.title}>
        {title}
      </Text>
      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.message}>
        {message}
      </Text>
      {children ? <View style={styles.actions}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {alignItems: 'center', paddingTop: spacing.xl, paddingHorizontal: spacing.xs},
  badge: {marginTop: spacing.sm},
  title: {
    marginTop: spacing.md,
    color: colors.textPrimary,
    fontSize: typography.hero,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  message: {marginTop: spacing.xs, color: colors.textSecondary, fontSize: typography.body, textAlign: 'center'},
  actions: {alignSelf: 'stretch', marginTop: spacing.xl, gap: spacing.sm},
});
