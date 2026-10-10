import React, {useState} from 'react';
import {
  useNavigation,
  useRoute,
  type NavigationProp,
  type ParamListBase,
} from '@react-navigation/native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {CustomerTabParamList} from '../../../app/navigation/types';
import {useAppDispatch, useAppSelector} from '../../../app/store/hooks';
import {resolveReducedMotionAnimation} from '../../../design/motion';
import {useReducedMotionPreference} from '../../../design/reducedMotion';
import {
  borderWidth,
  colors,
  fontWeight,
  iconSize,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Icon, type IconName} from '../../../shared/components/Icon';
import {LoadingIndicator} from '../../../shared/components/LoadingIndicator';
import {resolveCartAddressSelection} from '../../cart/domain/cartAddressSelection';
import {cartActions} from '../../cart/state/cartSlice';
import {
  customerAddressDisplayLine,
  customerAddressLabel,
  toCustomerBrowsingLocation,
  type CustomerAddress,
} from '../../customerAddresses/domain/customerAddressContract';
import {useCustomerAddressesQuery} from '../../customerAddresses/query/customerAddressQueries';
import {CustomerAddressEditorModal} from '../../customerAddresses/screens/CustomerAddressEditorModal';
import {
  browsingLocationLabel,
  useCustomerHeaderState,
  useCustomerLocationOptions,
} from '../hooks/useCustomerHeaderState';
import type {CustomerBrowsingLocation} from '../state/customerShellSlice';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export type DeliveryAddressEditorTarget =
  | {mode: 'add'; start: 'search' | 'current-location'}
  | {mode: 'edit'; address: CustomerAddress};

type CustomerTabsNavigation = BottomTabNavigationProp<CustomerTabParamList>;

/** Makes a location the browsing location, and the cart address when picking for the cart. */
export function useDeliveryLocationSelection(commerceSelection: boolean) {
  const dispatch = useAppDispatch();
  const {selectLocation} = useCustomerLocationOptions();
  const cartAddress = useAppSelector(state => state.cart.dependencies.address);
  const deliveryQuoteStatus = useAppSelector(
    state => state.cart.dependencies.deliveryQuote.status,
  );

  return (location: CustomerBrowsingLocation) => {
    selectLocation(location);
    if (!commerceSelection) {
      return;
    }
    const transition = resolveCartAddressSelection(
      cartAddress.addressId,
      deliveryQuoteStatus,
      location.addressId,
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
  };
}

/** The Ola address flow opened from a delivery picker: whatever is saved or picked is delivered to. */
export function DeliveryAddressEditor({
  target,
  commerceSelection = false,
  onClose,
}: {
  target: DeliveryAddressEditorTarget;
  commerceSelection?: boolean;
  onClose: () => void;
}) {
  const {addresses} = useCustomerAddressesQuery();
  const selectDelivery = useDeliveryLocationSelection(commerceSelection);
  const deliverTo = (address: CustomerAddress) => {
    const location = toCustomerBrowsingLocation(address);
    if (location) {
      selectDelivery(location);
    }
  };

  return (
    <CustomerAddressEditorModal
      address={target.mode === 'edit' ? target.address : undefined}
      addresses={addresses}
      mode={target.mode}
      onClose={onClose}
      onPickSavedAddress={deliverTo}
      onSaved={deliverTo}
      start={target.mode === 'add' ? target.start : undefined}
    />
  );
}

function labelIcon(label: string): IconName {
  const key = label.trim().toUpperCase();
  if (key === 'HOME') return 'home';
  if (key === 'WORK') return 'work';
  return 'location';
}

/** Saved addresses without a map pin cannot be delivered to until a pin is set. */
function UnpinnedAddresses({onSetPin}: {onSetPin: (address: CustomerAddress) => void}) {
  const {addresses} = useCustomerAddressesQuery();
  const unpinned = addresses.filter(
    address => address.latitude === null || address.longitude === null,
  );

  return (
    <>
      {unpinned.map(address => (
        <Pressable
          accessibilityHint="Opens the map to set this address's delivery pin"
          accessibilityLabel={`${customerAddressLabel(address)}, ${customerAddressDisplayLine(address)}. Needs a map pin before delivery`}
          accessibilityRole="button"
          key={address.id}
          onPress={() => onSetPin(address)}
          style={({pressed}) => [styles.row, pressed && styles.pressed]}>
          <View style={styles.rowIcon}>
            <Icon color={colors.flameRed} name="location" size={18} surface={false} />
          </View>
          <View style={styles.rowCopy}>
            <View style={styles.rowLabelLine}>
              <Text style={styles.rowLabel}>{customerAddressLabel(address)}</Text>
              <View style={styles.tag}>
                <Text style={styles.tagText}>Set map pin</Text>
              </View>
            </View>
            <Text numberOfLines={2} style={styles.rowAddress}>
              {customerAddressDisplayLine(address)}
            </Text>
          </View>
          <Icon color={colors.textSecondary} name="chevron-right" size={18} surface={false} />
        </Pressable>
      ))}
    </>
  );
}

export function CustomerLocationSelector({visible, onClose}: Props) {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const route = useRoute();
  const reduceMotionEnabled = useReducedMotionPreference();
  const {selectedLocation} = useCustomerHeaderState();
  const {locations, status, refresh} = useCustomerLocationOptions();
  const cartAddress = useAppSelector(state => state.cart.dependencies.address);
  const commerceSelection = route.name === 'CustomerCart';
  const selectDelivery = useDeliveryLocationSelection(commerceSelection);
  const [editorTarget, setEditorTarget] = useState<DeliveryAddressEditorTarget | null>(null);
  const selectedAddressId = commerceSelection
    ? cartAddress.addressId
    : selectedLocation?.addressId ?? null;
  const customerTabs = navigation.getParent<CustomerTabsNavigation>();

  const openEditor = (target: DeliveryAddressEditorTarget) => {
    setEditorTarget(target);
    onClose();
  };

  const openAddressManager = () => {
    if (!customerTabs) {
      return;
    }
    onClose();
    customerTabs.navigate('Profile', {screen: 'CustomerAddresses'});
  };

  return (
    <>
      <Modal
        animationType={resolveReducedMotionAnimation(
          'slide' as const,
          reduceMotionEnabled,
        )}
        onRequestClose={onClose}
        transparent
        visible={visible}>
        <View style={styles.backdrop}>
          <Pressable
            accessible={false}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            onPress={onClose}
            style={StyleSheet.absoluteFill}
          />
          <View
            accessibilityViewIsModal
            onAccessibilityEscape={onClose}
            style={styles.sheet}>
            <View accessibilityElementsHidden style={styles.handle} />
            <View style={styles.headingRow}>
              <Text accessibilityRole="header" style={styles.title}>
                {commerceSelection ? 'Choose delivery address' : 'Choose delivery location'}
              </Text>
              <Pressable
                accessibilityLabel="Close"
                accessibilityRole="button"
                hitSlop={spacing.xs}
                onPress={onClose}
                style={({pressed}) => [styles.closeButton, pressed && styles.pressed]}>
                <Icon color={colors.textPrimary} name="close" size={22} surface={false} />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}>
              <Pressable
                accessibilityHint="Opens place search"
                accessibilityLabel="Search for area, street or landmark"
                accessibilityRole="search"
                onPress={() => openEditor({mode: 'add', start: 'search'})}
                style={({pressed}) => [styles.searchField, pressed && styles.pressed]}>
                <Icon color={colors.flameRedAccessible} name="search" size={iconSize.lg} surface={false} />
                <Text style={styles.searchPlaceholder}>Search for area, street or landmark</Text>
              </Pressable>

              <View style={styles.actionCard}>
                <Pressable
                  accessibilityHint="Asks for location access and finds your address with GPS"
                  accessibilityRole="button"
                  onPress={() => openEditor({mode: 'add', start: 'current-location'})}
                  style={({pressed}) => [styles.actionRow, pressed && styles.pressed]}>
                  <View style={styles.rowIcon}>
                    <Icon color={colors.flameRed} name="gps" size={20} surface={false} />
                  </View>
                  <View style={styles.rowCopy}>
                    <Text style={styles.currentTitle}>Use current location</Text>
                    <Text style={styles.rowAddress}>Find your address with GPS</Text>
                  </View>
                  <Icon color={colors.textSecondary} name="chevron-right" size={18} surface={false} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => openEditor({mode: 'add', start: 'search'})}
                  style={({pressed}) => [styles.actionRow, pressed && styles.pressed]}>
                  <View style={styles.rowIcon}>
                    <Icon color={colors.textPrimary} name="plus" size={20} surface={false} />
                  </View>
                  <View style={styles.rowCopy}>
                    <Text style={styles.actionTitle}>Add new address</Text>
                    <Text style={styles.rowAddress}>Search, set the pin, add flat details</Text>
                  </View>
                  <Icon color={colors.textSecondary} name="chevron-right" size={18} surface={false} />
                </Pressable>
              </View>

              <Text accessibilityRole="header" style={styles.overline}>
                Saved addresses
              </Text>

              {status === 'pending' ? (
                <View style={styles.stateBox}>
                  <LoadingIndicator
                    accessibilityLabel="Loading saved locations"
                    label="Loading saved locations…"
                  />
                </View>
              ) : (
                <View accessibilityRole="radiogroup" style={styles.list}>
                  {locations.map(location => {
                    const selected = selectedAddressId === location.addressId;
                    const label = browsingLocationLabel(location.label);
                    return (
                      <Pressable
                        accessibilityLabel={`${label}, ${location.displayName}`}
                        accessibilityRole="radio"
                        accessibilityState={{checked: selected}}
                        key={location.addressId}
                        onPress={() => {
                          selectDelivery(location);
                          onClose();
                        }}
                        style={({pressed}) => [
                          styles.row,
                          selected && styles.rowSelected,
                          pressed && styles.pressed,
                        ]}>
                        <View style={styles.rowIcon}>
                          <Icon
                            color={colors.flameRed}
                            name={labelIcon(location.label)}
                            size={18}
                            surface={false}
                          />
                        </View>
                        <View style={styles.rowCopy}>
                          <Text style={styles.rowLabel}>{label}</Text>
                          <Text numberOfLines={2} style={styles.rowAddress}>
                            {location.displayName}
                          </Text>
                        </View>
                        {selected ? (
                          <View style={styles.checkBadge}>
                            <Icon color={colors.white} name="check" size={14} surface={false} />
                          </View>
                        ) : (
                          <View style={styles.radio} />
                        )}
                      </Pressable>
                    );
                  })}
                  <UnpinnedAddresses
                    onSetPin={address => openEditor({mode: 'edit', address})}
                  />
                  {locations.length === 0 ? (
                    <View style={styles.stateBox}>
                      <Text style={styles.stateText}>
                        Your saved delivery addresses will appear here.
                      </Text>
                      {status === 'error' ? (
                        <Pressable
                          accessibilityLabel="Retry saved locations"
                          accessibilityRole="button"
                          onPress={() => {
                            refresh();
                          }}
                          style={styles.textButton}>
                          <Text style={styles.textButtonLabel}>Try again</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              )}

              {customerTabs ? (
                <Pressable
                  accessibilityLabel="Manage saved addresses"
                  accessibilityRole="button"
                  onPress={openAddressManager}
                  style={({pressed}) => [styles.textButton, pressed && styles.pressed]}>
                  <Text style={styles.textButtonLabel}>Manage addresses</Text>
                </Pressable>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {editorTarget ? (
        <DeliveryAddressEditor
          commerceSelection={commerceSelection}
          onClose={() => setEditorTarget(null)}
          target={editorTarget}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(38,26,21,0.32)',
  },
  sheet: {
    maxHeight: '88%',
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    marginBottom: spacing.sm,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
  },
  title: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  closeButton: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  pressed: {opacity: 0.84},
  content: {
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  searchField: {
    minHeight: touchTarget.comfortable,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.borderStrong,
  },
  searchPlaceholder: {flex: 1, color: colors.placeholder, fontSize: typography.body},
  actionCard: {
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  actionRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  currentTitle: {
    color: colors.flameRedAccessible,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  actionTitle: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  overline: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  list: {gap: spacing.xs},
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  rowSelected: {
    borderColor: colors.flameRed,
    borderWidth: borderWidth.strong,
    padding: spacing.sm - 1,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconSurface,
  },
  rowCopy: {minWidth: 0, flex: 1, gap: 2},
  rowLabelLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  rowLabel: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  rowAddress: {color: colors.textSecondary, fontSize: typography.small},
  tag: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.warningSoft,
  },
  tagText: {
    color: colors.warningText,
    fontSize: typography.tiny + 1,
    fontWeight: fontWeight.semibold,
  },
  checkBadge: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.flameRedAccessible,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
  },
  stateBox: {
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  stateText: {
    color: colors.textSecondary,
    fontSize: typography.small,
    textAlign: 'center',
  },
  textButton: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  textButtonLabel: {
    color: colors.flameRedAccessible,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
});
