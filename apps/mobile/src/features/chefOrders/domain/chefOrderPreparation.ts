import type {ChefMenuItem} from '../../chefMenu/api/chefMenuApi';
import type {ChefOrderDetail} from '../api/chefOrderDetailApi';

export type ChefPreparationItem = Pick<
  ChefMenuItem,
  'id' | 'kitchenId' | 'preparationTimeMinutes'
>;

const DEFAULT_PREPARATION_MINUTES = 15;

export function resolveChefOrderPreparationTime(
  order: ChefOrderDetail,
  menuItems: readonly ChefPreparationItem[],
): number {
  if (order.prepTimeMinutes != null) {
    return order.prepTimeMinutes;
  }
  const preparationByItem = new Map(
    menuItems
      .filter(item => item.kitchenId === order.kitchenId)
      .map(item => [item.id, item.preparationTimeMinutes]),
  );
  // Items are prepared together, matching the existing cart's longest-item rule.
  return order.items.length === 0
    ? DEFAULT_PREPARATION_MINUTES
    : Math.max(
        ...order.items.map(
          item => preparationByItem.get(item.menuItemId) ?? DEFAULT_PREPARATION_MINUTES,
        ),
      );
}
