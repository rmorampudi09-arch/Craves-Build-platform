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
import {Icon, type IconName} from '../../../shared/components/Icon';
import {CustomerChefAvatar} from '../../customerShell/components/CustomerChefAvatar';
import type {CustomerOrder} from '../domain/customerOrderTypes';
import {
  formatCustomerOrderCreatedAt,
  formatCustomerOrderMoney,
  getCustomerOrderDisplayReference,
  getCustomerOrderProgressPresentation,
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
}

type ActionVariant = 'outline' | 'primary' | 'neutral';

interface CardActionProps {
  label: string;
  variant?: ActionVariant;
  icon?: IconName;
  onPress: () => void;
}

function CardAction({
  label,
  variant = 'outline',
  icon,
  onPress,
}: CardActionProps) {
  const primary = variant === 'primary';
  const neutral = variant === 'neutral';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({pressed}) => [
        styles.action,
        primary && styles.actionPrimary,
        neutral && styles.actionNeutral,
        pressed && styles.actionPressed,
      ]}>
      {icon ? (
        <Icon
          name={icon}
          size={17}
          color={primary ? colors.white : neutral ? colors.espressoBrown : colors.flameRed}
          surface={false}
        />
      ) : null}
      <Text
        style={[
          styles.actionText,
          primary && styles.actionTextPrimary,
          neutral && styles.actionTextNeutral,
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

function toneColor(tone: CustomerOrderStatusTone): string {
  switch (tone) {
    case 'success':
      return colors.success;
    case 'warning':
      return colors.warning;
    case 'danger':
      return colors.error;
    case 'muted':
      return colors.textSecondary;
    case 'accent':
      return colors.flameRedAccessible;
  }
}

export function CustomerOrderCard({
  order,
  onReorder,
  reorderPending = false,
}: Props) {
  const navigation = useNavigation<NavigationProp<CustomerOrdersStackParamList>>();
  const kitchen = useCustomerOrderKitchenPresentationQuery(order.kitchenId);
  const onPressDetails = () =>
    navigation.navigate('CustomerOrderDetail', {orderId: order.id});
  const status = getCustomerOrderStatusPresentation(order.status);
  const progress = getCustomerOrderProgressPresentation(order);
  const referenceAction = getCustomerOrderReferenceAction(order.status);
  const visibleItems = order.items.slice(0, 3);
  const remainingItems = Math.max(order.items.length - visibleItems.length, 0);
  const kitchenDescription =
    kitchen.data?.description?.trim() || 'Home kitchen';

  return (
    <Pressable
      accessible={false}
      onPress={onPressDetails}
      style={({pressed}) => [styles.card, pressed && styles.cardPressed]}>
      <View style={styles.topRow}>
        <View style={styles.orderColumn}>
          <Text numberOfLines={1} style={styles.orderNumber}>
            Order #{getCustomerOrderDisplayReference(order.id)}
          </Text>
          <Text style={styles.orderDate}>
            {formatCustomerOrderCreatedAt(order.createdAt)}
          </Text>
          <Text style={[styles.statusText, {color: toneColor(status.tone)}]}>
            {status.label}
          </Text>
          <View style={styles.progressRow}>
            <Icon
              name={progress.icon}
              size={15}
              color={toneColor(progress.tone)}
              surface={false}
            />
            <Text
              numberOfLines={2}
              style={[styles.progressText, {color: toneColor(progress.tone)}]}>
              {progress.label}
            </Text>
          </View>
        </View>

        <View style={styles.kitchenColumn}>
          <CustomerChefAvatar size={46} />
          <View style={styles.kitchenCopy}>
            <Text numberOfLines={2} style={styles.kitchenName}>
              {order.kitchenName}
            </Text>
            <Text numberOfLines={2} style={styles.kitchenDescription}>
              {kitchenDescription}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.contentRow}>
        <View style={styles.itemsColumn}>
          <View style={styles.itemsRow}>
            {visibleItems.map(item => (
              <CustomerOrderMenuItemImage
                key={item.id}
                menuItemId={item.menuItemId}
                size={44}
              />
            ))}
            {remainingItems > 0 ? (
              <View style={styles.moreTile}>
                <Text style={styles.moreTileText}>+{remainingItems}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.actionsColumn}>
          <CardAction label="View Details" onPress={onPressDetails} />
          {referenceAction === 'REORDER' ? (
            <CardAction
              label={reorderPending ? 'Preparing…' : 'Reorder'}
              variant="neutral"
              onPress={() => {
                if (!reorderPending) onReorder(order);
              }}
            />
          ) : null}
        </View>
      </View>

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue}>
          {formatCustomerOrderMoney(order.grandTotal)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
    ...elevation.card,
  },
  cardPressed: {opacity: 0.96},
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  orderColumn: {
    minWidth: 0,
    flex: 1,
  },
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
  statusText: {
    marginTop: spacing.xs,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  progressRow: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xxs,
    marginTop: spacing.xs,
  },
  progressText: {
    minWidth: 0,
    flex: 1,
    fontSize: typography.tiny,
    lineHeight: 17,
  },
  kitchenColumn: {
    minWidth: 0,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  kitchenCopy: {
    minWidth: 0,
    flex: 1,
  },
  kitchenName: {
    color: colors.espressoBrown,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  kitchenDescription: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
    lineHeight: 16,
  },
  contentRow: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  itemsColumn: {
    minWidth: 0,
    flex: 1,
  },
  itemsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  moreTile: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  moreTileText: {
    color: colors.espressoBrown,
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
  },
  actionsColumn: {
    width: 124,
    gap: spacing.xs,
  },
  action: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.flameRed,
    backgroundColor: colors.white,
  },
  actionPrimary: {
    borderColor: colors.flameRed,
    backgroundColor: colors.flameRed,
  },
  actionNeutral: {
    borderColor: colors.borderStrong,
    backgroundColor: colors.white,
  },
  actionPressed: {opacity: 0.82},
  actionText: {
    color: colors.flameRed,
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  actionTextPrimary: {color: colors.white},
  actionTextNeutral: {color: colors.espressoBrown},
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
  },
  totalLabel: {
    color: colors.espressoBrown,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  totalValue: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.extrabold,
  },
});
