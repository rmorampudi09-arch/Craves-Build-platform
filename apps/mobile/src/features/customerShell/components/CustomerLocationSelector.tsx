import React from 'react';
import {useRoute} from '@react-navigation/native';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useAppDispatch, useAppSelector} from '../../../app/store/hooks';
import {
  colors,
  fontWeight,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {resolveCartAddressSelection} from '../../cart/domain/cartAddressSelection';
import {cartActions} from '../../cart/state/cartSlice';
import {
  useCustomerHeaderState,
  useCustomerLocationOptions,
} from '../hooks/useCustomerHeaderState';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function CustomerLocationSelector({visible, onClose}: Props) {
  const route = useRoute();
  const dispatch = useAppDispatch();
  const {selectedLocation} = useCustomerHeaderState();
  const {locations, status, refresh, selectLocation} = useCustomerLocationOptions();
  const cartAddress = useAppSelector(state => state.cart.dependencies.address);
  const deliveryQuoteStatus = useAppSelector(
    state => state.cart.dependencies.deliveryQuote.status,
  );
  const commerceSelection = route.name === 'CustomerCart';
  const selectedAddressId = commerceSelection
    ? cartAddress.addressId
    : selectedLocation?.addressId ?? null;

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={visible}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close location selector"
        onPress={onClose}
        style={styles.backdrop}>
        <Pressable onPress={() => undefined} style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.headingRow}>
            <View style={styles.headingCopy}>
              <Text style={styles.title}>
                {commerceSelection ? 'Choose delivery address' : 'Choose location'}
              </Text>
              <Text style={styles.subtitle}>
                {commerceSelection
                  ? 'Use a saved address for this cart'
                  : 'Use one of your saved addresses'}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={spacing.xs}
              onPress={onClose}
              style={styles.closeButton}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>

          {status === 'pending' ? (
            <View style={styles.stateBox}>
              <ActivityIndicator color={colors.flameRed} />
              <Text style={styles.stateText}>Loading saved locations…</Text>
            </View>
          ) : locations.length === 0 ? (
            <View style={styles.stateBox}>
              <Text style={styles.stateTitle}>No saved locations yet</Text>
              <Text style={styles.stateText}>
                Address creation stays in its owning address-management phase.
              </Text>
              {status === 'error' ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    refresh();
                  }}>
                  <Text style={styles.retryText}>Try again</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.list}>
              {locations.map(location => {
                const selected = selectedAddressId === location.addressId;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{selected}}
                    key={location.addressId}
                    onPress={() => {
                      selectLocation(location);

                      if (commerceSelection) {
                        const transition = resolveCartAddressSelection(
                          cartAddress.addressId,
                          deliveryQuoteStatus,
                          location.addressId,
                        );
                        dispatch(
                          cartActions.addressDependencyChanged(transition.address),
                        );
                        if (transition.changed) {
                          dispatch(
                            cartActions.dependencyStatusChanged({
                              dependency: 'deliveryQuote',
                              status: transition.deliveryQuoteStatus,
                            }),
                          );
                        }
                      }

                      onClose();
                    }}
                    style={[styles.row, selected && styles.rowSelected]}>
                    <View style={styles.rowIcon}>
                      <Icon name="location" size={20} color={colors.flameRed} />
                    </View>
                    <View style={styles.rowCopy}>
                      <Text style={styles.rowLabel}>{location.label}</Text>
                      <Text numberOfLines={2} style={styles.rowAddress}>
                        {location.displayName}
                      </Text>
                    </View>
                    {selected ? (
                      <Icon name="check" size={20} color={colors.flameRed} />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(38,26,21,0.32)',
  },
  sheet: {
    maxHeight: '72%',
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    marginBottom: spacing.md,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  headingCopy: {
    minWidth: 0,
    flex: 1,
  },
  title: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xxs,
  },
  closeButton: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: colors.espressoBrown,
    fontSize: 30,
    fontWeight: fontWeight.regular,
  },
  stateBox: {
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  stateTitle: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  stateText: {
    color: colors.textSecondary,
    fontSize: typography.small,
    textAlign: 'center',
  },
  retryText: {
    color: colors.flameRed,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
    marginTop: spacing.xs,
  },
  list: {
    gap: spacing.xs,
    paddingBottom: spacing.md,
  },
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  rowSelected: {
    borderColor: colors.flameRed,
    backgroundColor: colors.surfaceWarm,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceWarm,
  },
  rowCopy: {
    minWidth: 0,
    flex: 1,
  },
  rowLabel: {
    color: colors.espressoBrown,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  rowAddress: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xxs,
  },
});
