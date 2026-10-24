import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {colors, fontWeight, iconSize, radius, spacing, textDefaults, typography} from '../../../../design/tokens';
import {Icon} from '../../../../shared/components/Icon';
import {ChefCard} from './ChefCard';
import {EmptyState} from './EmptyState';
import {StatusChip} from './StatusChip';

/**
 * Shown where a feature is not published for the app yet. Never an error, never a retry.
 * Full page by default; `compact` keeps the small card for a section that sits among others on the page.
 */
export function ComingSoon({title, message, compact = false}: {title: string; message: string; compact?: boolean}) {
  if (!compact) {
    return (
      <EmptyState
        badge={<StatusChip label="Coming soon" tone="soon" />}
        illustration="comingSoon"
        message={message}
        title={title}
      />
    );
  }
  return (
    <ChefCard>
      <View style={styles.row}>
        <View style={styles.tile}>
          <Icon name="clock" size={iconSize.md} color={colors.infoText} surface={false} />
        </View>
        <View style={styles.text}>
          <Text
            accessibilityRole="header"
            allowFontScaling={textDefaults.allowFontScaling}
            style={styles.title}>
            {title}
          </Text>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.message}>
            {message}
          </Text>
          <View style={styles.chip}>
            <StatusChip label="Coming soon" tone="soon" />
          </View>
        </View>
      </View>
    </ChefCard>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm},
  tile: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {flex: 1, minWidth: 0, gap: spacing.xxs},
  title: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold},
  message: {color: colors.textSecondary, fontSize: typography.small},
  chip: {alignSelf: 'flex-start', marginTop: spacing.xs},
});
