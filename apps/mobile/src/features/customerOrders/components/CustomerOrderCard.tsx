import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation, type NavigationProp} from '@react-navigation/native';
import type {CustomerOrdersStackParamList} from '../../../app/navigation/types';
import {
  borderWidth,
  colors,
  elevation,
  fontWeight,
  radius,
  spacing,
  typography,
} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {getProductionCustomerOrderMutationDecision} from '../domain/customerOrderActionEligibility';
import type {CustomerOrder} from '../domain/customerOrderTypes';
import {
  formatCustomerOrderCreatedAt,
  formatCustomerOrderMoney,
  getCustomerOrderDisplayReference,
  getCustomerOrderReferenceAction,
  getCustomerOrderStatusPresentation,
  type CustomerOrderStatusTone,
} from '../presentation/customerOrdersPresentation';

interface Props {
  order: CustomerOrder;
}

interface UnavailableActionProps {
  label: string;
  primary?: boolean;
  hint: string;
}

interface CardActionProps {
  label: string;
  primary?: boolean;
  onPress: () => void;
}

function CardAction({label, primary = false, onPress}: CardActionProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({pressed}) => [
        styles.action,
        primary && styles.actionPrimary,
        pressed && styles.actionPressed,
      ]}>
      <Text style={[styles.actionText, primary && styles.actionTextPrimary]}>
        {label}
      </Text>
    </Pressable>
  );
}

function UnavailableAction({
  label,
  primary = false,
  hint,
}: UnavailableActionProps) {
  return (
    <View
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{disabled: true}}
      style={[
        styles.action,
        styles.unavailableAction,
        primary && styles.actionPrimary,
      ]}>
      <Text style={[styles.actionText, primary && styles.actionTextPrimary]}>
        {label}
      </Text>
    </View>
  );
}

function statusToneStyle(tone: CustomerOrderStatusTone) {
  switch (tone) {
    case 'success':
      return styles.statusSuccess;
    case 'warning':
      return styles.statusWarning;
    case 'danger':
      return styles.statusDanger;
    case 'muted':
      return styles.statusMuted;
    case 'accent':
      return styles.statusAccent;
  }
}

export function CustomerOrderCard({order}: Props) {
  const navigation = useNavigation<NavigationProp<CustomerOrdersStackParamList>>();
  const onPressDetails = () =>
    navigation.navigate('CustomerOrderDetail', {orderId: order.id});
  const onPressTrack = () =>
    navigation.navigate('CustomerOrderTracking', {orderId: order.id});
  const status = getCustomerOrderStatusPresentation(order.status);
  const referenceAction = getCustomerOrderReferenceAction(order.status);
  const reorderDecision = getProductionCustomerOrderMutationDecision('REORDER');
  const reorderUnavailableMessage =
    reorderDecision.kind === 'BLOCKED'
      ? reorderDecision.message
      : 'Reorder requires authoritative revalidation before cart mutation.';
  const visibleItems = order.items.slice(0, 3);
  const remainingItems = Math.max(order.items.length - visibleItems.length, 0);

  return (
    <Pressable
      accessible={false}
      onPress={onPressDetails}
      style={({pressed}) => [styles.card, pressed && styles.cardPressed]}>
      <View style={styles.headerRow}>
        <View style={styles.orderHeading}>
          <Text style={styles.orderNumber}>
            Order #{getCustomerOrderDisplayReference(order.id)}
          </Text>
          <Text style={styles.orderDate}>
            {formatCustomerOrderCreatedAt(order.createdAt)}
          </Text>
        </View>
        <View style={[styles.statusPill, statusToneStyle(status.tone)]}>
          <Text style={styles.statusText}>{status.label}</Text>
        </View>
      </View>

      <View style={styles.kitchenRow}>
        <View style={styles.kitchenAvatar}>
          <Icon name="chef" size={24} color={colors.flameRed} />
        </View>
        <View style={styles.kitchenCopy}>
          <Text numberOfLines={1} style={styles.kitchenName}>
            {order.kitchenName}
          </Text>
          <Text style={styles.kitchenMeta}>
            {order.items.length} {order.items.length === 1 ? 'item' : 'items'}
          </Text>
        </View>
      </View>

      <View style={styles.itemsRow}>
        {visibleItems.map(item => (
          <View key={item.id} style={styles.itemTile}>
            <Text numberOfLines={2} style={styles.itemTileText}>
              {item.itemName}
            </Text>
          </View>
        ))}
        {remainingItems > 0 ? (
          <View style={styles.moreTile}>
            <Text style={styles.moreTileText}>+{remainingItems}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue}>
          {formatCustomerOrderMoney(order.grandTotal)}
        </Text>
      </View>

      <View style={styles.actionsRow}>
        <CardAction label="View Details" onPress={onPressDetails} />
        {referenceAction === 'TRACK' ? (
          <CardAction label="Track Order" primary onPress={onPressTrack} />
        ) : null}
        {referenceAction === 'REORDER' ? (
          <UnavailableAction
            label="Reorder"
            hint={reorderUnavailableMessage}
          />
        ) : null}
      </View>

      {referenceAction === 'REORDER' ? (
        <Text style={styles.capabilityNote}>{reorderUnavailableMessage}</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
    ...elevation.card,
  },
  cardPressed: {opacity: 0.94},
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  orderHeading: {minWidth: 0, flex: 1},
  orderNumber: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  orderDate: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  statusPill: {
    maxWidth: '46%',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  statusAccent: {backgroundColor: colors.errorSoft},
  statusSuccess: {backgroundColor: colors.successSoft},
  statusWarning: {backgroundColor: colors.warningSoft},
  statusDanger: {backgroundColor: colors.errorSoft},
  statusMuted: {backgroundColor: colors.surfaceMuted},
  statusText: {
    color: colors.espressoBrown,
    fontSize: typography.tiny,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  kitchenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: borderWidth.standard,
    borderTopColor: colors.border,
  },
  kitchenAvatar: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceWarm,
  },
  kitchenCopy: {minWidth: 0, flex: 1},
  kitchenName: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  kitchenMeta: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  itemsRow: {flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md},
  itemTile: {
    minWidth: 0,
    flex: 1,
    minHeight: 62,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceWarm,
  },
  itemTileText: {
    color: colors.espressoBrown,
    fontSize: typography.tiny,
    fontWeight: fontWeight.medium,
    textAlign: 'center',
  },
  moreTile: {
    width: 48,
    minHeight: 62,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  moreTileText: {
    color: colors.espressoBrown,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  totalLabel: {color: colors.textSecondary, fontSize: typography.small},
  totalValue: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  actionsRow: {flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md},
  action: {
    minWidth: 0,
    minHeight: 56,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.flameRed,
    backgroundColor: colors.white,
  },
  actionPrimary: {backgroundColor: colors.flameRed},
  actionPressed: {opacity: 0.82},
  unavailableAction: {opacity: 0.48},
  actionText: {
    color: colors.flameRed,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  actionTextPrimary: {color: colors.white},
  capabilityNote: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: typography.tiny,
    textAlign: 'center',
  },
});
