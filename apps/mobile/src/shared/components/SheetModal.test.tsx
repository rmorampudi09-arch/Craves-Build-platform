import React from 'react';
import {Modal, Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {SheetModal} from './SheetModal';

jest.mock('../../design/reducedMotion', () => ({useReducedMotionPreference: () => true}));

describe('SheetModal', () => {
  it('shows the card while visible, closes at once, and the dim closes it', () => {
    const onRequestClose = jest.fn();
    const onScrimPress = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <SheetModal onRequestClose={onRequestClose} onScrimPress={onScrimPress} visible>
          <Text>Card</Text>
        </SheetModal>,
      );
    });
    expect(tree.root.findByType(Modal).props.visible).toBe(true);
    expect(tree.root.findByType(Modal).props.animationType).toBe('none');
    const scrim = tree.root.findAll(node => typeof node.type !== 'string' && node.props.accessibilityLabel === 'Close' && node.props.onPress)[0];
    act(() => scrim.props.onPress());
    expect(onScrimPress).toHaveBeenCalledTimes(1);
    expect(onRequestClose).not.toHaveBeenCalled();
    act(() => tree.update(<SheetModal onRequestClose={onRequestClose} visible={false}><Text>Card</Text></SheetModal>));
    expect(tree.root.findByType(Modal).props.visible).toBe(false);
  });
});
