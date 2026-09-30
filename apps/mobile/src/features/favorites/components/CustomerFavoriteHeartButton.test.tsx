import React from 'react';
import renderer, {act} from 'react-test-renderer';
import MaterialDesignIcons from '@react-native-vector-icons/material-design-icons';
import {colors} from '../../../design/tokens';
import {CustomerFavoriteHeartButton} from './CustomerFavoriteHeartButton';

it('uses a white unselected outline over glass and preserves the red selected heart', () => {
  let tree: renderer.ReactTestRenderer;
  act(() => { tree=renderer.create(<CustomerFavoriteHeartButton favorite={false} inactiveColor={colors.white} onToggle={() => undefined} />); });
  expect(tree!.root.findByType(MaterialDesignIcons).props).toMatchObject({name: 'heart-outline', color: colors.white});
  act(() => tree.update(<CustomerFavoriteHeartButton favorite inactiveColor={colors.white} onToggle={() => undefined} />));
  expect(tree!.root.findByType(MaterialDesignIcons).props).toMatchObject({name: 'heart', color: colors.flameRed});
  act(() => tree.unmount());
});
