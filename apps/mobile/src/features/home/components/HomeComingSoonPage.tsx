import React from 'react';
import {RefreshControl, ScrollView, StyleSheet, Text, View} from 'react-native';
import {colors, fontWeight, radius, spacing, typography, iconSize} from '../../../design/tokens';
import {Button} from '../../../shared/components/Button';
import {EmptyIllustration} from '../../../shared/components/EmptyIllustration';
import {Icon} from '../../../shared/components/Icon';
import {comingSoonTitle} from '../../customerEmptyStates/domain/customerEmptyStateModel';

export interface HomeComingSoonPageProps {
  /** Area name or address line of the selected delivery location. */
  locationName: string;
  /** Saved address label, such as "Home". */
  locationLabel: string;
  subscribed: boolean;
  notifyPending: boolean;
  notifyError?: string | null;
  onNotify: () => void;
  onChangeAddress: () => void;
  refreshing: boolean;
  onRefresh: () => void;
  topInset: number;
  bottomPadding: number;
}

/** Home when no kitchen cooks near the selected address: only this page, no search, banner or categories. */
export function HomeComingSoonPage({
  locationName,
  locationLabel,
  subscribed,
  notifyPending,
  notifyError,
  onNotify,
  onChangeAddress,
  refreshing,
  onRefresh,
  topInset,
  bottomPadding,
}: HomeComingSoonPageProps) {
  return (
    <ScrollView
      contentContainerStyle={[styles.content, {paddingTop: topInset + spacing.xl, paddingBottom: bottomPadding}]}
      refreshControl={
        <RefreshControl
          colors={[colors.flameRed]}
          onRefresh={onRefresh}
          refreshing={refreshing}
          tintColor={colors.flameRed}
        />
      }
      showsVerticalScrollIndicator={false}
      style={styles.page}
      testID="customer-home-coming-soon">
      <EmptyIllustration name="deliveryBike" width={264} />
      <Text accessibilityRole="header" style={styles.title}>
        {comingSoonTitle(locationName)}
      </Text>
      <Text style={styles.body}>
        Home chefs don't cook near this address yet. Get a notification when the first kitchen opens here.
      </Text>
      <View style={styles.addressCard}>
        <Icon color={colors.flameRedAccessible} name="location" size={36} />
        <View style={styles.addressText}>
          <Text style={styles.addressCaption}>Delivering to {locationLabel}</Text>
          <Text numberOfLines={1} style={styles.addressLine}>
            {locationName}
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        {subscribed ? (
          <View
            accessibilityLiveRegion="polite"
            accessibilityRole="text"
            style={styles.subscribed}
            testID="coming-soon-subscribed">
            <View style={styles.subscribedTick}>
              <Icon color={colors.white} name="check" size={iconSize.xs} surface={false} />
            </View>
            <Text style={styles.subscribedText}>You'll get a notification when it opens</Text>
          </View>
        ) : (
          <Button
            label="Notify me"
            leftIcon="bell"
            iconSurface={false}
            loading={notifyPending}
            onPress={onNotify}
            style={styles.pill}
            testID="coming-soon-notify"
          />
        )}
        {notifyError ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {notifyError}
          </Text>
        ) : null}
        <Button
          label="Change address"
          leftIcon="location"
          onPress={onChangeAddress}
          style={styles.pill}
          testID="coming-soon-change-address"
          variant="outline"
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.white,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  title: {
    marginTop: spacing.lg,
    color: colors.textPrimary,
    fontSize: typography.hero,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  body: {
    marginTop: spacing.sm,
    maxWidth: 320,
    color: colors.textSecondary,
    fontSize: typography.small,
    textAlign: 'center',
  },
  addressCard: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addressText: {
    flex: 1,
    minWidth: 0,
  },
  addressCaption: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  addressLine: {
    color: colors.textPrimary,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  actions: {
    alignSelf: 'stretch',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  pill: {
    borderRadius: radius.pill,
  },
  subscribed: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.successSoft,
  },
  subscribedTick: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.success,
  },
  subscribedText: {
    flexShrink: 1,
    color: colors.successText,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  error: {
    color: colors.error,
    fontSize: typography.tiny,
    textAlign: 'center',
  },
});
