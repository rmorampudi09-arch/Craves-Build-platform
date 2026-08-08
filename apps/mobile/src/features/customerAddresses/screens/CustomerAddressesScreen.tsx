import React, {useCallback, useState} from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useQueryClient} from '@tanstack/react-query';
import {useCustomerBottomNavScroll} from '../../../app/navigation/CustomerBottomNavController';
import type {CustomerProfileStackParamList} from '../../../app/navigation/types';
import {useAppDispatch, useAppSelector} from '../../../app/store/hooks';
import {toAppApiError} from '../../../core/http/apiError';
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
import {TerminalState} from '../../../shared/components/LifecycleStates';
import {ScreenShell} from '../../../shared/components/ScreenShell';
import {resolveCartAddressSelection} from '../../cart/domain/cartAddressSelection';
import {CART_DELIVERY_QUOTE_CONTRACT_BLOCKER} from '../../cart/domain/cartDeliveryQuote';
import {
  selectCartDependencies,
  selectCartItemCount,
} from '../../cart/state/cartSelectors';
import {refreshCartSnapshot} from '../../cart/state/cartRefresh';
import {cartActions} from '../../cart/state/cartSlice';
import {invalidateCustomerHomeFeedQueries} from '../../home/query/homeFeedQueries';
import {customerShellActions} from '../../customerShell/state/customerShellSlice';
import {CustomerAddressesContractError} from '../api/customerAddressesApi';
import {
  customerAddressDisplayLine,
  customerAddressLabel,
  toCustomerBrowsingLocation,
  type CustomerAddress,
} from '../domain/customerAddressContract';
import {
  useCustomerAddressesQuery,
  useDeleteCustomerAddressMutation,
  useSetDefaultCustomerAddressMutation,
} from '../query/customerAddressQueries';
import {CustomerAddressEditorModal} from './CustomerAddressEditorModal';

type AddressesNavigation = NativeStackNavigationProp<
  CustomerProfileStackParamList,
  'CustomerAddresses'
>;

type FeedbackTone = 'success' | 'warning' | 'error';

interface FeedbackState {
  tone: FeedbackTone;
  message: string;
}

type EditorTarget =
  | {mode: 'add'}
  | {mode: 'edit'; address: CustomerAddress}
  | null;

function AddressesSkeleton() {
  return (
    <View
      accessibilityLabel="Loading saved addresses"
      accessibilityRole="progressbar"
      style={styles.skeletonWrap}>
      {[0, 1].map(item => (
        <View key={item} style={styles.skeletonCard}>
          <View style={styles.skeletonTitle} />
          <View style={styles.skeletonLine} />
          <View style={styles.skeletonLineShort} />
          <View style={styles.skeletonActions} />
        </View>
      ))}
    </View>
  );
}

function AddressCard({
  address,
  selected,
  deleting,
  delivering,
  settingDefault,
  onDelete,
  onDeliver,
  onEdit,
  onSetDefault,
}: {
  address: CustomerAddress;
  selected: boolean;
  deleting: boolean;
  delivering: boolean;
  settingDefault: boolean;
  onDelete: () => void;
  onDeliver: () => void;
  onEdit: () => void;
  onSetDefault: () => void;
}) {
  const busy = deleting || delivering || settingDefault;

  return (
    <View style={[styles.addressCard, selected && styles.addressCardSelected]}>
      <View style={styles.addressHeading}>
        <View style={styles.addressIcon}>
          <Icon name="location" size={iconSize.sm} color={colors.flameRed} />
        </View>
        <View style={styles.addressHeadingCopy}>
          <View style={styles.labelRow}>
            <Text style={styles.addressLabel}>
              {customerAddressLabel(address)}
            </Text>
            {address.isDefault ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Default</Text>
              </View>
            ) : null}
            {selected ? (
              <View style={styles.selectedBadge}>
                <Icon name="check" size={iconSize.xs} color={colors.flameRed} />
                <Text style={styles.selectedBadgeText}>Selected</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.recipientName}>{address.recipientName}</Text>
          <Text style={styles.phone}>{address.contactPhoneNumber}</Text>
        </View>
      </View>

      <Text style={styles.fullAddress}>
        {customerAddressDisplayLine(address)}
      </Text>

      <View style={styles.actions}>
        <Button
          disabled={busy}
          label="Edit"
          onPress={onEdit}
          style={styles.actionButton}
          variant="outline"
        />
        <Button
          disabled={busy || address.isDefault}
          label={address.isDefault ? 'Default' : 'Set default'}
          loading={settingDefault}
          onPress={onSetDefault}
          style={styles.actionButton}
          variant="outline"
        />
      </View>
      <Button
        disabled={busy}
        label="Delete"
        loading={deleting}
        onPress={onDelete}
        style={styles.deleteButton}
        variant="ghost"
      />
      <Button
        disabled={busy}
        label={selected ? 'Deliver Here · Selected' : 'Deliver Here'}
        loading={delivering}
        onPress={onDeliver}
        style={styles.deliverButton}
      />
    </View>
  );
}

/** P66 list plus the P67 partial Add/Edit address entry points. */
export function CustomerAddressesScreen() {
  const navigation = useNavigation<AddressesNavigation>();
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const addressesQuery = useCustomerAddressesQuery();
  const setDefaultMutation = useSetDefaultCustomerAddressMutation();
  const deleteMutation = useDeleteCustomerAddressMutation();
  const bottomNavScroll = useCustomerBottomNavScroll();
  const selectedLocation = useAppSelector(
    state => state.customerShell.selectedLocation,
  );
  const cartDependencies = useAppSelector(selectCartDependencies);
  const itemCount = useAppSelector(selectCartItemCount);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deliveringId, setDeliveringId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [editorTarget, setEditorTarget] = useState<EditorTarget>(null);

  const handleSetDefault = useCallback(
    async (address: CustomerAddress) => {
      if (setDefaultMutation.isPending) {
        return;
      }
      setFeedback(null);
      setSettingDefaultId(address.id);
      try {
        await setDefaultMutation.mutateAsync(address);
        setFeedback({
          tone: 'success',
          message: `${customerAddressLabel(address)} is now your default address.`,
        });
      } catch (caught) {
        const error = toAppApiError(caught);
        setFeedback({tone: 'error', message: error.message});
      } finally {
        setSettingDefaultId(null);
      }
    },
    [setDefaultMutation],
  );

  const performDelete = useCallback(
    async (address: CustomerAddress) => {
      if (deleteMutation.isPending) {
        return;
      }
      setFeedback(null);
      setDeletingId(address.id);
      try {
        await deleteMutation.mutateAsync(address.id);

        if (selectedLocation?.addressId === address.id) {
          dispatch(customerShellActions.locationCleared());
          invalidateCustomerHomeFeedQueries(queryClient);
        }

        if (cartDependencies.address.addressId === address.id) {
          dispatch(
            cartActions.addressDependencyChanged({
              status: 'UNRESOLVED',
              addressId: null,
            }),
          );
          dispatch(
            cartActions.dependencyStatusChanged({
              dependency: 'deliveryQuote',
              status: 'UNRESOLVED',
            }),
          );
        }

        setFeedback({tone: 'success', message: 'Saved address deleted.'});
      } catch (caught) {
        const error = toAppApiError(caught);
        setFeedback({tone: 'error', message: error.message});
      } finally {
        setDeletingId(null);
      }
    },
    [
      cartDependencies.address.addressId,
      deleteMutation,
      dispatch,
      queryClient,
      selectedLocation?.addressId,
    ],
  );

  const confirmDelete = useCallback(
    (address: CustomerAddress) => {
      Alert.alert(
        'Delete saved address?',
        `Delete ${customerAddressLabel(address)}? This cannot be undone.`,
        [
          {text: 'Cancel', style: 'cancel'},
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              performDelete(address).catch(() => undefined);
            },
          },
        ],
      );
    },
    [performDelete],
  );

  const handleDeliverHere = useCallback(
    async (address: CustomerAddress) => {
      if (deliveringId) {
        return;
      }

      setFeedback(null);
      setDeliveringId(address.id);
      const location = toCustomerBrowsingLocation(address);
      const browsingLocationChanged =
        selectedLocation?.addressId !== location.addressId ||
        selectedLocation.latitude !== location.latitude ||
        selectedLocation.longitude !== location.longitude;

      dispatch(customerShellActions.locationSelected(location));
      if (browsingLocationChanged) {
        invalidateCustomerHomeFeedQueries(queryClient);
      }

      const transition = resolveCartAddressSelection(
        cartDependencies.address.addressId,
        cartDependencies.deliveryQuote.status,
        address.id,
      );
      dispatch(cartActions.addressDependencyChanged(transition.address));
      if (transition.changed) {
        dispatch(
          cartActions.dependencyStatusChanged({
            dependency: 'deliveryQuote',
            status: transition.deliveryQuoteStatus,
          }),
        );
      }

      if (itemCount === 0) {
        setFeedback({
          tone: 'success',
          message: `${customerAddressLabel(address)} selected for delivery.`,
        });
        setDeliveringId(null);
        return;
      }

      const refresh = await dispatch(refreshCartSnapshot());
      if (refresh.status === 'FAILED') {
        setFeedback({
          tone: 'error',
          message: `Address selected, but the cart could not refresh: ${refresh.error.message}`,
        });
      } else {
        setFeedback({
          tone: 'warning',
          message:
            'Address selected and cart refreshed. Delivery fee, ETA and serviceability cannot refresh yet because the approved delivery-quote contract is not available.',
        });
      }
      setDeliveringId(null);
    },
    [
      cartDependencies.address.addressId,
      cartDependencies.deliveryQuote.status,
      deliveringId,
      dispatch,
      itemCount,
      queryClient,
      selectedLocation,
    ],
  );

  const retry = useCallback(() => {
    addressesQuery.refetch().catch(() => undefined);
  }, [addressesQuery]);

  const openAdd = useCallback(() => {
    setFeedback(null);
    setEditorTarget({mode: 'add'});
  }, []);

  const body = (() => {
    if (addressesQuery.sessionRequired) {
      return (
        <TerminalState
          title="Sign in required"
          description="Your saved addresses are private and require an authenticated customer session."
        />
      );
    }
    if (addressesQuery.isPending) {
      return <AddressesSkeleton />;
    }
    if (addressesQuery.isError) {
      const invalidContract =
        addressesQuery.error instanceof CustomerAddressesContractError;
      return (
        <TerminalState
          actionLabel="Try again"
          description={
            invalidContract
              ? 'The saved-address response did not match the approved mobile contract.'
              : 'Check your connection and try loading your saved addresses again.'
          }
          onAction={retry}
          title="Addresses could not be loaded"
        />
      );
    }
    if (addressesQuery.addresses.length === 0) {
      return (
        <TerminalState
          actionLabel="Add address"
          description="Enter a delivery address manually. New-address persistence will activate when its approved backend contract is available."
          onAction={openAdd}
          title="No saved addresses"
        />
      );
    }

    return (
      <View style={styles.list}>
        {addressesQuery.addresses.map(address => {
          const selected =
            selectedLocation?.addressId === address.id ||
            cartDependencies.address.addressId === address.id;
          return (
            <AddressCard
              address={address}
              deleting={deletingId === address.id}
              delivering={deliveringId === address.id}
              key={address.id}
              onDelete={() => confirmDelete(address)}
              onDeliver={() => {
                handleDeliverHere(address).catch(caught => {
                  const error = toAppApiError(caught);
                  setFeedback({tone: 'error', message: error.message});
                  setDeliveringId(null);
                });
              }}
              onEdit={() => {
                setFeedback(null);
                setEditorTarget({mode: 'edit', address});
              }}
              onSetDefault={() => {
                handleSetDefault(address).catch(() => undefined);
              }}
              selected={selected}
              settingDefault={settingDefaultId === address.id}
            />
          );
        })}
      </View>
    );
  })();

  return (
    <>
      <ScreenShell
        edges={['top']}
        keyboardAvoiding={false}
        testID="customer-addresses">
        <View style={styles.root}>
          <View style={styles.header}>
            <Pressable
              accessibilityLabel="Back"
              accessibilityRole="button"
              hitSlop={spacing.sm}
              onPress={() => navigation.goBack()}
              style={({pressed}) => [
                styles.backButton,
                pressed && styles.pressed,
              ]}>
              <Icon
                name="arrow-left"
                color={colors.espressoBrown}
                size={iconSize.md}
              />
            </Pressable>
            <Text accessibilityRole="header" style={styles.title}>
              My Addresses
            </Text>
            <View style={styles.headerSpacer} />
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            onScroll={bottomNavScroll.onScroll}
            refreshControl={
              addressesQuery.sessionRequired ? undefined : (
                <RefreshControl
                  colors={[colors.flameRed]}
                  onRefresh={retry}
                  refreshing={addressesQuery.isRefetching}
                  tintColor={colors.flameRed}
                />
              )
            }
            scrollEventThrottle={bottomNavScroll.scrollEventThrottle}
            showsVerticalScrollIndicator={false}>
            <View style={styles.intro}>
              <Text style={styles.introTitle}>Saved delivery addresses</Text>
              <Text style={styles.introCopy}>
                Add or edit address details, choose a default address, remove an
                address, or use Deliver Here for your current order.
              </Text>
              {!addressesQuery.sessionRequired ? (
                <Button
                  label="Add new address"
                  leftIcon="location"
                  onPress={openAdd}
                  style={styles.addButton}
                  variant="outline"
                />
              ) : null}
            </View>

            {feedback ? (
              <View
                accessibilityRole="alert"
                style={[
                  styles.feedback,
                  feedback.tone === 'error' && styles.feedbackError,
                  feedback.tone === 'warning' && styles.feedbackWarning,
                ]}>
                <Text style={styles.feedbackText}>{feedback.message}</Text>
                {feedback.tone === 'warning' ? (
                  <Text style={styles.feedbackCode}>
                    {CART_DELIVERY_QUOTE_CONTRACT_BLOCKER}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {body}
          </ScrollView>
        </View>
      </ScreenShell>

      {editorTarget ? (
        <CustomerAddressEditorModal
          address={
            editorTarget.mode === 'edit' ? editorTarget.address : undefined
          }
          addresses={addressesQuery.addresses}
          mode={editorTarget.mode}
          onClose={() => setEditorTarget(null)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.surfaceWarm},
  header: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    borderBottomWidth: borderWidth.standard,
    borderBottomColor: colors.border,
    backgroundColor: colors.white,
  },
  backButton: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  pressed: {opacity: 0.72},
  title: {
    flex: 1,
    textAlign: 'center',
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  headerSpacer: {width: touchTarget.minimum},
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  intro: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  introTitle: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  introCopy: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xs,
  },
  addButton: {marginTop: spacing.md, alignSelf: 'stretch'},
  feedback: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    padding: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radius.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.success,
    backgroundColor: colors.white,
  },
  feedbackWarning: {borderColor: colors.warning},
  feedbackError: {borderColor: colors.error},
  feedbackText: {color: colors.textPrimary, fontSize: typography.small},
  feedbackCode: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    marginTop: spacing.xs,
  },
  list: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    gap: spacing.md,
  },
  addressCard: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
    ...elevation.card,
  },
  addressCardSelected: {borderColor: colors.flameRed},
  addressHeading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  addressIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceWarm,
  },
  addressHeadingCopy: {flex: 1, minWidth: 0},
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  addressLabel: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  badge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceWarm,
  },
  badgeText: {
    color: colors.flameRed,
    fontSize: typography.tiny,
    fontWeight: fontWeight.semibold,
  },
  selectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceWarm,
  },
  selectedBadgeText: {
    color: colors.flameRed,
    fontSize: typography.tiny,
    fontWeight: fontWeight.semibold,
  },
  recipientName: {
    color: colors.textPrimary,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
    marginTop: spacing.xs,
  },
  phone: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xxs,
  },
  fullAddress: {
    color: colors.textSecondary,
    fontSize: typography.small,
    lineHeight: 20,
    marginTop: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionButton: {flex: 1},
  deleteButton: {marginTop: spacing.xs},
  deliverButton: {marginTop: spacing.sm},
  skeletonWrap: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    gap: spacing.md,
  },
  skeletonCard: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    gap: spacing.sm,
  },
  skeletonTitle: {
    width: '38%',
    height: 20,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonLine: {
    width: '100%',
    height: 14,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonLineShort: {
    width: '68%',
    height: 14,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonActions: {
    width: '100%',
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
});
