import type {ChefOrderDetail} from '../api/chefOrderDetailApi';
import {resolveChefOrderPreparationTime, type ChefPreparationItem} from './chefOrderPreparation';

const kitchenId = 'kitchen-1';
const item = (id: string, preparationTimeMinutes: number | null): ChefPreparationItem => ({
  id, kitchenId, preparationTimeMinutes,
});
const order = (ids: string[], prepTimeMinutes: number | null = null) => ({
  kitchenId,
  prepTimeMinutes,
  items: ids.map(menuItemId => ({menuItemId, quantity: 4})),
} as ChefOrderDetail);

describe('automatic Chef order preparation time', () => {
  it('uses the ordered item time rather than a manual or blanket default', () => {
    expect(resolveChefOrderPreparationTime(order(['rice']), [item('rice', 25)])).toBe(25);
  });

  it('uses the longest ordered item, not sum, quantity or an unrelated dish', () => {
    expect(resolveChefOrderPreparationTime(order(['rice', 'curry']), [
      item('rice', 25), item('curry', 40), item('unrelated', 90),
    ])).toBe(40);
  });

  it('does not increase a saved item time below 15 minutes', () => {
    expect(resolveChefOrderPreparationTime(order(['rice']), [item('rice', 5)])).toBe(5);
  });

  it('defaults only missing times to 15 minutes, including removed items', () => {
    expect(resolveChefOrderPreparationTime(order(['rice']), [item('rice', null)])).toBe(15);
    expect(resolveChefOrderPreparationTime(order(['removed']), [])).toBe(15);
    expect(resolveChefOrderPreparationTime(order(['rice', 'missing']), [item('rice', 5)])).toBe(15);
    expect(resolveChefOrderPreparationTime(order(['rice', 'missing']), [item('rice', 25)])).toBe(25);
  });

  it('does not use menu metadata belonging to another kitchen', () => {
    expect(resolveChefOrderPreparationTime(order(['rice']), [{...item('rice', 90), kitchenId: 'other'}])).toBe(15);
  });

  it('preserves an existing authoritative order time', () => {
    expect(resolveChefOrderPreparationTime(order(['rice'], 30), [item('rice', 25)])).toBe(30);
  });
});
