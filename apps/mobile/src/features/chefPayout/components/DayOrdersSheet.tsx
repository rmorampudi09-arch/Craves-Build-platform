import React from 'react';
import {StyleSheet, Text} from 'react-native';
import {colors, textDefaults, typography} from '../../../design/tokens';
import {chefOrderChip} from '../../chefOrders/domain/chefOrderFilters';
import type {ChefOperationalOrder} from '../../chefShell/api/chefOperationalApi';
import {ChefSheet, ListGroup, ListRow, StatusChip} from '../../chefShell/components/ui';
import {formatRupeesExact, shortOrderNumber} from '../../chefShell/domain/chefFormat';

export interface DayOrdersSheetProps {
  visible: boolean;
  onClose: () => void;
  /** `Orders · Yesterday`. */
  title: string;
  orders: readonly ChefOperationalOrder[];
  now: Date;
  onOpenOrder: (orderId: string) => void;
}

/** The orders of the day whose bar was tapped: number, customer, food total, status. A row opens the order. */
export function DayOrdersSheet({visible, onClose, title, orders, now, onOpenOrder}: DayOrdersSheetProps) {
  return (
    <ChefSheet onClose={onClose} title={title} visible={visible}>
      {orders.length === 0 ? (
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.empty}>
          No orders this day.
        </Text>
      ) : (
        <ListGroup>
          {orders.map(order => {
            const chip = chefOrderChip(order, now);
            const label = [shortOrderNumber(order.id), order.customerName].filter(Boolean).join(' · ');
            const total = order.foodSubtotal != null ? formatRupeesExact(order.foodSubtotal) : undefined;
            return (
              <ListRow
                key={order.id}
                accessibilityLabel={[label, total, chip.label].filter(Boolean).join(', ')}
                onPress={() => onOpenOrder(order.id)}
                right={<StatusChip label={chip.label} tone={chip.tone} />}
                subtitle={total}
                title={label}
              />
            );
          })}
        </ListGroup>
      )}
    </ChefSheet>
  );
}

const styles = StyleSheet.create({
  empty: {color: colors.textSecondary, fontSize: typography.body},
});
