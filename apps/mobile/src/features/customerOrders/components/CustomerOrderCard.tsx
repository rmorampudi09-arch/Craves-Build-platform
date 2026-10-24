import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation, type NavigationProp} from '@react-navigation/native';
import type {CustomerOrdersStackParamList} from '../../../app/navigation/types';
import {borderWidth, colors, fontWeight, radius, spacing, typography} from '../../../design/tokens';
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
  success: {text: colors.successText, fill: colors.successSoft},
  warning: {text: colors.warningText, fill: colors.warningSoft},
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
        <CustomerChefAvatar imageUrl={kitchen.data?.chefPhotoUrl} size={48} />
        <View style={styles.flexCopy}>
          <Text numberOfLines={1} style={styles.kitchenName}>
            {order.kitchenName}
          </Text>
          <Text numberOfLines={2} style={styles.meta}>
            {formatCustomerOrderCreatedAt(order.createdAt)} · #
            {getCustomerOrderDisplayReference(order.id)}
          </Text>
        </View>
        <Text style={styles.total}>{formatCustomerOrderMoney(order.grandTotal)}</Text>
      </View>

      <View style={styles.itemsRow}>
        {visibleItems.map(item => (
          <CustomerOrderMenuItemImage key={item.id} menuItemId={item.menuItemId} size={52} />
        ))}
        {remainingItems > 0 ? (
          <View style={styles.moreTile}>
            <Text style={styles.moreText}>+{remainingItems}</Text>
          </View>
        ) : null}
        <Text numberOfLines={2} style={styles.itemSummary}>
          {itemSummary}
        </Text>
      </View>

      <View style={styles.footer}>
        <View style={[styles.statusPill, {backgroundColor: tone.fill}]}>
          <Text numberOfLines={1} style={[styles.statusText, {color: tone.text}]}>
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
              onPress={() => {
                if (!reorderPending && !reorderDisabled) onReorder(order);
              }}
              style={({pressed}) => [
                styles.reorder,
                pressed && styles.pressed,
                reorderDisabled && styles.disabled,
              ]}>
              <Icon name="renew" size={16} color={colors.flameRed} surface={false} />
              <Text style={styles.reorderText}>{reorderPending ? 'Preparing…' : 'Reorder'}</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityLabel={`${referenceAction === 'TRACK' ? 'Track' : 'View'} order from ${order.kitchenName}`}
            accessibilityRole="button"
            onPress={onPressDetails}
            style={({pressed}) => [styles.detailsLink, pressed && styles.pressed]}>
            <Text style={styles.redText}>
              {referenceAction === 'TRACK' ? 'Track order' : 'Details'}
            </Text>
            {referenceAction === 'TRACK' ? (
              <Icon name="chevron-right" size={18} color={colors.flameRed} surface={false} />
            ) : null}
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: 14,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  cardPressed: {backgroundColor: colors.surfaceMuted},
  pressed: {opacity: 0.6},
  disabled: {opacity: 0.45},
  topRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  flexCopy: {minWidth: 0, flex: 1, gap: 2},
  kitchenName: {color: colors.textPrimary, fontSize: typography.heading, fontWeight: fontWeight.bold},
  meta: {color: colors.textSecondary, fontSize: typography.small},
  total: {color: colors.textPrimary, fontSize: typography.heading, fontWeight: fontWeight.bold},
  itemsRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs},
  moreTile: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  moreText: {color: colors.textPrimary, fontSize: typography.small, fontWeight: fontWeight.semibold},
  itemSummary: {
    minWidth: 0,
    flex: 1,
    marginLeft: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.body,
  },
  footer: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: borderWidth.standard,
    borderTopColor: colors.border,
  },
  statusPill: {
    flexShrink: 1,
    minHeight: 30,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
  },
  statusText: {fontSize: typography.small, fontWeight: fontWeight.bold},
  actions: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  reorder: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
  },
  reorderText: {color: colors.textPrimary, fontSize: typography.small, fontWeight: fontWeight.semibold},
  detailsLink: {minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 2},
  redText: {color: colors.flameRedAccessible, fontSize: typography.body, fontWeight: fontWeight.bold},
});
