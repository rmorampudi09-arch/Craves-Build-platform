import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {
  colors,
  fontWeight,
  iconSize,
  radius,
  spacing,
  textDefaults,
  typography,
} from '../../../../design/tokens';
import {Icon} from '../../../../shared/components/Icon';
import {formatRelativeTime, formatRupees, shortOrderNumber} from '../../domain/chefFormat';
import {ChefCard} from './ChefCard';
import {VegMark, type VegMarkType} from './VegMark';

export interface OrderCardOrder {
  id: string;
  customerName?: string;
  area?: string;
  /** ISO timestamp; shown as "2 min ago". */
  placedAt?: string;
  total?: number;
  items: {name: string; quantity: number; foodType?: VegMarkType | null}[];
  /** What the customer asked for, e.g. "Less spicy please". */
  note?: string;
}

export interface OrderCardProps {
  order: OrderCardOrder;
  /** The screen's own buttons and timer. Kept outside the tappable summary so TalkBack can reach each button. */
  actions?: React.ReactNode;
  highlighted?: boolean;
  /** Opens the order. */
  onPress?: () => void;
}

export function OrderCard({order, actions, highlighted, onPress}: OrderCardProps) {
  const number = shortOrderNumber(order.id);
  const who = [
    order.customerName,
    order.area,
    order.placedAt ? formatRelativeTime(order.placedAt, new Date()) : undefined,
  ]
    .filter(Boolean)
    .join(' · ');

  const summary = (
    <>
      <View style={styles.top}>
        <View style={styles.idBlock}>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.id}>
            {number}
          </Text>
          {who ? (
            <Text allowFontScaling={textDefaults.allowFontScaling} numberOfLines={2} style={styles.who}>
              {who}
            </Text>
          ) : null}
        </View>
        {order.total !== undefined ? (
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.amount}>
            {formatRupees(order.total)}
          </Text>
        ) : null}
      </View>
      <View style={styles.items}>
        {order.items.map((item, index) => (
          <View key={index} style={styles.item}>
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.quantity}>
              {`${item.quantity}×`}
            </Text>
            {item.foodType ? <VegMark type={item.foodType} /> : null}
            <Text allowFontScaling={textDefaults.allowFontScaling} numberOfLines={2} style={styles.itemName}>
              {item.name}
            </Text>
          </View>
        ))}
      </View>
      {order.note ? (
        <View style={styles.note}>
          <Icon name="info" size={iconSize.xs} color={colors.warningText} surface={false} />
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.noteText}>
            {`“${order.note}”`}
          </Text>
        </View>
      ) : null}
    </>
  );

  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <ChefCard highlighted={highlighted} style={styles.card}>
      {onPress ? (
        <Pressable
          accessibilityLabel={[
            `Order ${number}`,
            order.total !== undefined ? formatRupees(order.total) : undefined,
            order.customerName,
            `${itemCount} ${itemCount === 1 ? 'item' : 'items'}`,
          ]
            .filter(Boolean)
            .join(', ')}
          accessibilityRole="button"
          onPress={onPress}
          style={({pressed}) => pressed && styles.pressed}>
          {summary}
        </Pressable>
      ) : (
        summary
      )}
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </ChefCard>
  );
}

const styles = StyleSheet.create({
  card: {padding: 0, overflow: 'hidden'},
  pressed: {opacity: 0.85},
  top: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  idBlock: {flex: 1, minWidth: 0},
  id: {color: colors.textPrimary, fontSize: typography.button, fontWeight: fontWeight.extrabold},
  who: {marginTop: 2, color: colors.textSecondary, fontSize: typography.small},
  amount: {color: colors.textPrimary, fontSize: typography.button, fontWeight: fontWeight.extrabold},
  items: {gap: spacing.xxs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm},
  item: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs},
  quantity: {minWidth: 26, color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.extrabold},
  itemName: {flex: 1, minWidth: 0, color: colors.textPrimary, fontSize: typography.body},
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.warningSoft,
  },
  noteText: {flex: 1, color: colors.warningText, fontSize: typography.small},
  actions: {gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.md},
});
