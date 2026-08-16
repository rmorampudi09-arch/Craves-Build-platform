import React, {useCallback, useEffect, useMemo} from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NavigationProp} from '@react-navigation/native';
import {useCustomerBottomNavScroll} from '../../../app/navigation/CustomerBottomNavController';
import type {
  CustomerCartStackParamList,
  CustomerPaymentMethodsStackParamList,
} from '../../../app/navigation/types';
import {useAppDispatch, useAppSelector} from '../../../app/store/hooks';
import {
  borderWidth,
  colors,
  elevation,
  fontWeight,
  iconSize,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Button} from '../../../shared/components/Button';
import {Icon} from '../../../shared/components/Icon';
import {RecoverableErrorBanner} from '../../../shared/components/LifecycleStates';
import {ScreenShell} from '../../../shared/components/ScreenShell';
import {selectCartItemCount} from '../../cart/state/cartSelectors';
import {refreshCartSnapshot} from '../../cart/state/cartRefresh';
import {
  buildCustomerPaymentMethodsModel,
  type CustomerPaymentMethodOption,
} from '../domain/paymentMethodTypes';
import {selectPrimaryPaymentMethod} from '../state/paymentMethodSlice';

type PaymentMethodsNavigation = NavigationProp<
  CustomerPaymentMethodsStackParamList & CustomerCartStackParamList,
  'CustomerPaymentMethods'
>;

function MethodCard({
  option,
  onSelect,
}: {
  option: CustomerPaymentMethodOption;
  onSelect: (option: CustomerPaymentMethodOption) => void;
}) {
  const disabled = option.availability !== 'AVAILABLE';

  return (
    <Pressable
      accessibilityLabel={option.title}
      accessibilityHint={disabled ? option.blockerReason ?? undefined : option.description}
      accessibilityRole="button"
      accessibilityState={{disabled, selected: option.selected}}
      disabled={disabled}
      onPress={() => onSelect(option)}
      style={({pressed}) => [
        styles.methodCard,
        option.selected && styles.methodCardSelected,
        disabled && styles.methodCardBlocked,
        pressed && !disabled && styles.cardPressed,
      ]}>
      <View style={styles.methodHeadingRow}>
        <View style={styles.methodIcon}>
          <Icon
            name={option.id === 'RAZORPAY_ONLINE' ? 'shield' : 'orders'}
            size={iconSize.md}
            color={disabled ? colors.placeholder : colors.flameRed}
          />
        </View>
        <View style={styles.methodHeadingCopy}>
          <Text style={[styles.methodTitle, disabled && styles.blockedText]}>
            {option.title}
          </Text>
          <Text style={styles.methodDescription}>{option.description}</Text>
        </View>
        <View
          accessibilityElementsHidden
          style={[
            styles.radio,
            option.selected && styles.radioSelected,
            disabled && styles.radioBlocked,
          ]}>
          {option.selected ? <View style={styles.radioDot} /> : null}
        </View>
      </View>

      <View style={styles.channelRow}>
        {option.channels.map(channel => (
          <View key={channel} style={styles.channelPill}>
            <Text style={styles.channelText}>{channel}</Text>
          </View>
        ))}
      </View>

      {option.blockerReason ? (
        <View style={styles.blockerRow}>
          <Icon name="lock" size={iconSize.xs} color={colors.warning} />
          <Text style={styles.blockerText}>{option.blockerReason}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function CustomerPaymentMethodsScreen() {
  const navigation = useNavigation<PaymentMethodsNavigation>();
  const dispatch = useAppDispatch();
  const bottomNavScroll = useCustomerBottomNavScroll();
  const itemCount = useAppSelector(selectCartItemCount);
  const snapshotStatus = useAppSelector(state => state.cart.snapshotStatus);
  const snapshotErrorCode = useAppSelector(state => state.cart.snapshotErrorCode);
  const selectedMethodId = useAppSelector(
    state => state.paymentMethods.selectedPrimaryMethodId,
  );

  const model = useMemo(
    () =>
      buildCustomerPaymentMethodsModel({
        cartItemCount: itemCount,
        selectedMethodId,
      }),
    [itemCount, selectedMethodId],
  );

  useEffect(() => {
    if (snapshotStatus === 'UNINITIALIZED') {
      dispatch(refreshCartSnapshot());
    }
  }, [dispatch, snapshotStatus]);

  const handleSelect = useCallback(
    (option: CustomerPaymentMethodOption) => {
      if (option.availability !== 'AVAILABLE') {
        return;
      }
      dispatch(selectPrimaryPaymentMethod(option.id));
    },
    [dispatch],
  );

  const handleUseForCart = useCallback(() => {
    navigation.navigate('CustomerCart');
  }, [navigation]);

  const cartContextLoading =
    snapshotStatus === 'UNINITIALIZED' || snapshotStatus === 'LOADING';
  const cartContextError = snapshotStatus === 'ERROR';

  return (
    <ScreenShell edges={['top']} keyboardAvoiding={false} testID="customer-payment-methods">
      <View style={styles.root}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Back"
            accessibilityRole="button"
            hitSlop={spacing.xs}
            onPress={() => navigation.goBack()}
            style={({pressed}) => [styles.backButton, pressed && styles.cardPressed]}>
            <Icon name="arrow-left" size={iconSize.md} color={colors.espressoBrown} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text accessibilityRole="header" style={styles.title}>
              {model.title}
            </Text>
            <Text style={styles.subtitle}>{model.subtitle}</Text>
          </View>
        </View>

        {cartContextLoading && itemCount === 0 ? (
          <View accessibilityRole="progressbar" style={styles.loadingRow}>
            <ActivityIndicator color={colors.flameRed} />
            <Text style={styles.loadingText}>Checking your cart context…</Text>
          </View>
        ) : null}

        {cartContextError ? (
          <RecoverableErrorBanner
            message={
              snapshotErrorCode === 'NETWORK_ERROR'
                ? 'Cart context could not be refreshed while offline. Payment options shown here do not assume live cart eligibility.'
                : 'Cart context could not be refreshed. Payment options shown here do not assume live cart eligibility.'
            }
            onRetry={() => {
              dispatch(refreshCartSnapshot());
            }}
            style={styles.banner}
          />
        ) : null}

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          onScroll={bottomNavScroll.onScroll}
          scrollEventThrottle={bottomNavScroll.scrollEventThrottle}
          showsVerticalScrollIndicator={false}>
          <View style={styles.contextCard}>
            <Text style={styles.contextEyebrow}>
              {model.mode === 'ACTIVE_CART' ? 'ACTIVE CART' : 'NO ACTIVE CART'}
            </Text>
            <Text style={styles.contextTitle}>
              {model.mode === 'ACTIVE_CART'
                ? `${itemCount} ${itemCount === 1 ? 'item' : 'items'} ready for payment selection`
                : 'Browse payment capabilities safely'}
            </Text>
            <Text style={styles.contextCopy}>
              {model.mode === 'ACTIVE_CART'
                ? 'Your selection is kept in the current app session and can return to Cart. Checkout review remains a separate phase.'
                : 'No checkout selection is created without an active cart.'}
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payment options</Text>
            <Text style={styles.sectionCaption}>
              Availability is never inferred from a provider app returning to the foreground.
            </Text>
            {model.options.map(option => (
              <MethodCard key={option.id} option={option} onSelect={handleSelect} />
            ))}
          </View>

          <View style={styles.savedCard}>
            <View style={styles.savedHeading}>
              <View style={styles.methodIcon}>
                <Icon name="shield" size={iconSize.md} color={colors.espressoBrown} />
              </View>
              <View style={styles.savedCopy}>
                <Text style={styles.methodTitle}>Saved payment methods</Text>
                <Text style={styles.methodDescription}>
                  Saved cards, tokenized UPI instruments, default-method editing and expired-token states require an authoritative token API.
                </Text>
              </View>
            </View>
            <View style={styles.blockerRow}>
              <Icon name="lock" size={iconSize.xs} color={colors.warning} />
              <Text style={styles.blockerText}>
                The approved mobile runtime does not expose payment-token list or mutation endpoints yet, so this screen does not fabricate stored methods.
              </Text>
            </View>
          </View>

          <View style={styles.safetyCard}>
            <Icon name="check" size={iconSize.sm} color={colors.success} />
            <View style={styles.safetyCopy}>
              <Text style={styles.safetyTitle}>Secure provider handoff</Text>
              <Text style={styles.safetyText}>
                Online payment uses the backend-issued Razorpay order. Payment success is accepted only after signed backend verification and checkout reconciliation.
              </Text>
            </View>
          </View>
        </ScrollView>

        {model.mode === 'ACTIVE_CART' ? (
          <View style={styles.footer}>
            <Button
              label="Use for this cart"
              disabled={model.selectedMethodId === null}
              accessibilityHint={
                model.selectedMethodId
                  ? 'Returns to Cart with the selected payment route kept in session'
                  : 'Select an available payment route first'
              }
              onPress={handleUseForCart}
            />
          </View>
        ) : null}
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  backButton: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    paddingTop: spacing.xxs,
  },
  title: {
    color: colors.espressoBrown,
    fontSize: typography.hero,
    fontWeight: fontWeight.extrabold,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xxs,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.white,
  },
  loadingText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  banner: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  contextCard: {
    backgroundColor: colors.espressoBrown,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...elevation.card,
  },
  contextEyebrow: {
    color: colors.creamDeep,
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.8,
  },
  contextTitle: {
    color: colors.white,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
    marginTop: spacing.xs,
  },
  contextCopy: {
    color: colors.cream,
    fontSize: typography.small,
    marginTop: spacing.xs,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  sectionCaption: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: -spacing.xs,
  },
  methodCard: {
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    backgroundColor: colors.white,
    ...elevation.card,
  },
  methodCardSelected: {
    borderColor: colors.flameRed,
    borderWidth: borderWidth.strong,
  },
  methodCardBlocked: {
    backgroundColor: colors.surfaceMuted,
  },
  cardPressed: {
    opacity: 0.78,
  },
  methodHeadingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  methodIcon: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconSurface,
  },
  methodHeadingCopy: {
    flex: 1,
    minWidth: 0,
  },
  methodTitle: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  blockedText: {
    color: colors.textSecondary,
  },
  methodDescription: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xxs,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: borderWidth.strong,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xxs,
  },
  radioSelected: {
    borderColor: colors.flameRed,
  },
  radioBlocked: {
    borderColor: colors.border,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.flameRed,
  },
  channelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  channelPill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.white,
  },
  channelText: {
    color: colors.espressoBrown,
    fontSize: typography.tiny,
    fontWeight: fontWeight.semibold,
  },
  blockerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
  },
  blockerText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  savedCard: {
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    backgroundColor: colors.white,
  },
  savedHeading: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  savedCopy: {
    flex: 1,
    minWidth: 0,
  },
  safetyCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.successSoft,
  },
  safetyCopy: {
    flex: 1,
    minWidth: 0,
  },
  safetyTitle: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  safetyText: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xxs,
  },
  footer: {
    borderTopWidth: borderWidth.standard,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    backgroundColor: colors.white,
  },
});
