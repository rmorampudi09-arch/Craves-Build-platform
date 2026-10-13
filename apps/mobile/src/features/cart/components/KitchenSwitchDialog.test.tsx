import React from 'react';
import {Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {Button} from '../../../shared/components/Button';
import type {CartLine} from '../domain/cartTypes';
import {askKitchenSwitch, KitchenSwitchHost} from './KitchenSwitchDialog';
jest.mock('../../../design/reducedMotion', () => ({useReducedMotionPreference: () => false}));

const money = (amount: string) => ({amount, currency: 'INR'});
const line = (lineId: string, itemName: string): CartLine => ({
  lineId, itemName, menuItemId: `menu-${lineId}`, kitchenId: 'kitchen-a', kitchenName: 'Relangi mavayya kitchen',
  quantity: 1, unitPrice: money('130.00'), lineTotal: money('130.00'),
  createdAt: '2026-10-11T10:00:00Z', updatedAt: '2026-10-11T10:00:00Z',
});

describe('KitchenSwitchHost', () => {
  let tree: renderer.ReactTestRenderer;
  afterEach(() => act(() => tree?.unmount()));
  const texts = () => tree.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));
  const press = (label: string) => act(() => tree.root.findAllByType(Button).find(node => node.props.label === label)!.props.onPress());

  const open = async (onReplace: () => void) => {
    await act(async () => { tree = renderer.create(<KitchenSwitchHost />); });
    act(() => askKitchenSwitch({
      cartLines: [line('1', 'Chicken Pulavu rice'), line('2', 'Masala dosa'), line('3', 'Chicken curry')],
      newDish: {name: 'Paneer biryani', kitchenName: 'sai', priceLabel: '₹180'},
      onReplace,
    }));
  };

  it('shows what is in the cart and the dish that would replace it', async () => {
    await open(jest.fn());
    expect(texts()).toEqual(expect.arrayContaining(['Chicken Pulavu rice', 'Masala dosa', '+ 1 more dish', 'Paneer biryani']));
    expect(texts()).not.toContain('Chicken curry');
  });
  it('replaces only when the customer picks Replace', async () => {
    const onReplace = jest.fn();
    await open(onReplace);
    press('Keep cart');
    expect(onReplace).not.toHaveBeenCalled();
    expect(tree.toJSON()).toBeNull();
    await open(onReplace);
    press('Replace');
    expect(onReplace).toHaveBeenCalledTimes(1);
  });
});
