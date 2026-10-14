import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation, type NavigationProp} from '@react-navigation/native';
import type {CustomerOrdersStackParamList} from '../../../app/navigation/types';
import {colors, radius, spacing} from '../../../design/tokens';
import {iosType, iosWeight} from '../../../design/iosType';
import {Icon} from '../../../shared/components/Icon';
import {CustomerChefAvatar} from '../../customerShell/components/CustomerChefAvatar';
import type {CustomerOrder} from '../domain/customerOrderTypes';
import {
  formatCustomerOrderCreatedAt,
  formatCustomerOrderMoney,
  getCustomerOrderDisplayReference,
  getCustomerOrderReferenceAction,
  getCustomerOrderStatusPresentation,
  type CustomerOrderStatusTone,
} from '../presentation/customerOrdersPresentation';
import {useCustomerOrderKitchenPresentationQuery} from '../query/customerOrderCatalogQueries';
import {CustomerOrderMenuItemImage} from './CustomerOrderMenuItemImage';

interface Props {
  order: CustomerOrder;
  onReorder: (order: CustomerOrder) => void;
  reorderPending?: boolean;
  reorderDisabled?: boolean;
}

const TONES: Record<CustomerOrderStatusTone, {text: string; fill: string}> = {
  success: {text: '#14824F', fill: colors.successSoft},
  warning: {text: '#9A5B00', fill: colors.warningSoft},
  danger: {text: colors.flameRedAccessible, fill: colors.errorSoft},
  accent: {text: colors.flameRedAccessible, fill: colors.errorSoft},
  muted: {text: colors.textSecondary, fill: colors.surfaceMuted},
};

export function CustomerOrderCard({
  order,
  onReorder,
  reorderPending = false,
  reorderDisabled = false,
}: Props) {
  const navigation = useNavigation<NavigationProp<CustomerOrdersStackParamList>>();
  const kitchen = useCustomerOrderKitchenPresentationQuery(order.kitchenId);
  const onPressDetails = () =>
    navigation.navigate('CustomerOrderDetail', {orderId: order.id});
  const status = getCustomerOrderStatusPresentation(order.status);
  const tone = TONES[status.tone];
  const referenceAction = getCustomerOrderReferenceAction(order.status);
  const visibleItems = order.items.slice(0, 3);
  const remainingItems = Math.max(order.items.length - visibleItems.length, 0);
  const itemSummary = order.items
    .map(item => `${item.itemName} × ${item.quantity}`)
    .join(', ');

  return (
    <Pressable
      accessible={false}
      onPress={onPressDetails}
      style={({pressed}) => [styles.card, pressed && styles.cardPressed]}>
      <View style={styles.topRow}>
        <CustomerChefAvatar imageUrl={kitchen.data?.chefPhotoUrl} size={44} />
        <View style={styles.flexCopy}>
          <Text numberOfLines={1} style={[iosType.headline, styles.primaryText]}>
            {order.kitchenName}
          </Text>
          <Text numberOfLines={1} style={[iosType.footnote, styles.secondaryText]}>
            {formatCustomerOrderCreatedAt(order.createdAt)} · #
            {getCustomerOrderDisplayReference(order.id)}
          </Text>
        </View>
        <Text style={[iosType.headline, styles.primaryText]}>
          {formatCustomerOrderMoney(order.grandTotal)}
        </Text>
      </View>

      <View style={styles.itemsRow}>
        {visibleItems.map(item => (
          <CustomerOrderMenuItemImage key={item.id} menuItemId={item.menuItemId} size={48} />
        ))}
        {remainingItems > 0 ? (
          <View style={styles.moreTile}>
            <Text style={[iosType.footnote, iosWeight.semibold, styles.primaryText]}>
              +{remainingItems}
            </Text>
          </View>
        ) : null}
        <Text numberOfLines={2} style={[iosType.subheadline, styles.secondaryText, styles.itemSummary]}>
          {itemSummary}
        </Text>
      </View>

      <View style={styles.footer}>
        <View style={[styles.statusPill, {backgroundColor: tone.fill}]}>
          <View style={[styles.statusDot, {backgroundColor: tone.text}]} />
          <Text numberOfLines={1} style={[iosType.footnote, iosWeight.semibold, {color: tone.text}]}>
            {status.label}
          </Text>
        </View>
        <View style={styles.actions}>
          {referenceAction === 'REORDER' ? (
            <Pressable
              accessibilityLabel={reorderPending ? 'Preparing reorder' : 'Reorder'}
              accessibilityRole="button"
              accessibilityState={{disabled: reorderDisabled, busy: reorderPending}}
              disabled={reorderDisabled}
              hitSlop={6}
              onPress={() => {
                if (!reorderPending && !reorderDisabled) onReorder(order);
              }}
              style={({pressed}) => [
                styles.reorder,
                pressed && styles.pressed,
                reorderDisabled && styles.disabled,
              ]}>
              <Icon name="renew" size={15} color={colors.textPrimary} surface={false} />
              <Text style={[iosType.footnote, iosWeight.semibold, styles.primaryText]}>
                {reorderPending ? 'Preparing…' : 'Reorder'}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityLabel={`${referenceAction === 'TRACK' ? 'Track' : 'View'} order from ${order.kitchenName}`}
            accessibilityRole="button"
            hitSlop={6}
            onPress={onPressDetails}
            style={({pressed}) => [styles.detailsLink, pressed && styles.pressed]}>
            <Text style={[iosType.subheadline, iosWeight.semibold, styles.redText]}>
              {referenceAction === 'TRACK' ? 'Track order' : 'Details'}
            </Text>
            <Icon name="chevron-right" size={18} color={colors.flameRedAccessible} surface={false} />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

const HAIRLINE = StyleSheet.hairlineWidth;

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    borderRadius: radius.lg,
    borderWidth: HAIRLINE,
    borderColor: colors.borderStrong,
    backgroundColor: colors.white,
  },
  cardPressed: {backgroundColor: '#FBFAF9'},
  pressed: {opacity: 0.6},
  disabled: {opacity: 0.45},
  primaryText: {color: colors.textPrimary},
  secondaryText: {color: colors.textSecondary},
  redText: {color: colors.flameRedAccessible},
  topRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  flexCopy: {minWidth: 0, flex: 1, gap: 2},
  itemsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
  },
  moreTile: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  itemSummary: {minWidth: 0, flex: 1, marginLeft: 6},
  footer: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
    marginTop: spacing.sm,
    borderTopWidth: HAIRLINE,
    borderTopColor: colors.borderStrong,
  },
  statusPill: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  statusDot: {width: 6, height: 6, borderRadius: 3},
  actions: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  reorder: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  detailsLink: {minHeight: 44, flexDirection: 'row', alignItems: 'center'},
});
