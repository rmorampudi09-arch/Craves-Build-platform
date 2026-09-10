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
import {CustomerEmptyState} from '../../customerEmptyStates/components/CustomerEmptyState';
import {customerEmptyStateAdapters} from '../../customerEmptyStates/customerEmptyStateAdapters';
import {invalidateCustomerHomeFeedQueries} from '../../home/query/homeFeedQueries';
import {customerShellActions} from '../../customerShell/state/customerShellSlice';
import {CustomerAddressesContractError} from '../api/customerAddressesApi';
import {
  customerAddressDisplayLine,
  customerAddressLabel,
  isCustomerAddressDeliveryReady,
  toCustomerBrowsingLocation,
  type CustomerAddress,
} from '../domain/customerAddressContract';
import {
  useCustomerAddressesQuery,
  useDeleteCustomerAddressMutation,
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
  onDelete,
  onDeliver,
  onEdit,
}: {
  address: CustomerAddress;
  selected: boolean;
  deleting: boolean;
  delivering: boolean;
  onDelete: () => void;
  onDeliver: () => void;
  onEdit: () => void;
}) {
  const busy = deleting || delivering;
  const deliveryReady = isCustomerAddressDeliveryReady(address);

  return (
    <View style={[styles.addressCard, selected && styles.addressCardSelected]}>
      <View style={styles.addressHeading}>
        <View style={styles.addressIcon}>
          <Icon name="location" size={iconSize.sm} color={colors.flameRed} />
        </View>
        <View style={styles.addressHeadingCopy}>
          <View style={styles.labelRow}>
            <Text style={styles.addressLabel}>{customerAddressLabel(address)}</Text>
            {selected ? (
              <View style={styles.selectedBadge}>
                <Icon name="check" size={iconSize.xs} color={colors.flameRed} />
                <Text style={styles.selectedBadgeText}>Selected</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.recipientName}>
            {address.recipientName || 'Address details need an update'}
          </Text>
          <Text style={styles.phone}>{address.contactPhoneNumber}</Text>
        </View>
      </View>

      <Text style={styles.fullAddress}>{customerAddressDisplayLine(address)}</Text>

      {!deliveryReady ? (
        <View style={styles.updateNotice}>
          <Text style={styles.updateNoticeText}>
            Update this saved address before using it for delivery. Older saved
            addresses may be missing the mapped location or locality details.
          </Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button
          disabled={busy}
          label="Edit"
          onPress={onEdit}
          style={styles.actionButton}
          variant="outline"
        />
        <Button
          disabled={busy}
          label="Delete"
          loading={deleting}
          onPress={onDelete}
          style={styles.actionButton}
          variant="ghost"
        />
      </View>
      <Button
        disabled={busy || !deliveryReady}
        label={
          !deliveryReady
            ? 'Update address to deliver'
            : selected
              ? 'Deliver Here · Selected'
              : 'Deliver Here'
        }
        loading={delivering}
        onPress={onDeliver}
        style={styles.deliverButton}
      />
    </View>
  );
}

export function CustomerAddressesScreen() {
  const navigation = useNavigation<AddressesNavigation>();
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const addressesQuery = useCustomerAddressesQuery();
  const deleteMutation = useDeleteCustomerAddressMutation();
  const bottomNavScroll = useCustomerBottomNavScroll();
  const selectedLocation = useAppSelector(state => state.customerShell.selectedLocation);
  const cartDependencies = useAppSelector(selectCartDependencies);
  const itemCount = useAppSelector(selectCartItemCount);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deliveringId, setDeliveringId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [editorTarget, setEditorTarget] = useState<EditorTarget>(null);

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

      const location = toCustomerBrowsingLocation(address);
      if (!location) {
        setFeedback({
          tone: 'error',
          message:
            'Update this address and map its current location before using it for delivery.',
        });
        return;
      }

      setFeedback(null);
      setDeliveringId(address.id);
      const browsingLocationChanged =
        selectedLocation?.addressId !== location.addressId ||
        selectedLocation?.latitude !== location.latitude ||
        selectedLocation?.longitude !== location.longitude;

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
              ? 'The saved-address response could not be read safely. Try again after the latest app update.'
              : 'Check your connection and try loading your saved addresses again.'
          }
          onAction={retry}
          title="Addresses could not be loaded"
        />
      );
    }
    if (addressesQuery.addresses.length === 0) {
      return (
        <CustomerEmptyState
          model={customerEmptyStateAdapters.noSavedAddresses(false)}
          onAction={actionId => {
            if (actionId === 'ADD_ADDRESS') {
              openAdd();
            }
          }}
          testID="customer-addresses-empty"
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
              selected={selected}
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
              style={({pressed}) => [styles.backButton, pressed && styles.pressed]}>
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
                Add, edit or remove saved addresses. Craves uses your current
                browsing location when the app opens; choose Deliver Here only
                when you want a saved address for the current order.
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
          address={editorTarget.mode === 'edit' ? editorTarget.address : undefined}
          addresses={addressesQuery.addresses}
          mode={editorTarget.mode}
          onClose={() => setEditorTarget(null)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.white},
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
    backgroundColor: colors.iconSurface,
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
  selectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
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
  updateNotice: {
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.warning,
    backgroundColor: colors.white,
  },
  updateNoticeText: {
    color: colors.textSecondary,
    fontSize: typography.small,
    lineHeight: 19,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionButton: {flex: 1},
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
