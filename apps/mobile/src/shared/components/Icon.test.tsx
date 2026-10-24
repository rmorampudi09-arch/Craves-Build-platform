import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {StyleSheet, View} from 'react-native';
import {colors} from '../../design/tokens';
import {Icon, IconTileContext} from './Icon';

function boxBackground(element: React.ReactElement) {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(element);
  });
  const background = StyleSheet.flatten(tree.root.findByType(View).props.style).backgroundColor;
  act(() => tree.unmount());
  return background;
}

describe('icon soft-red circle', () => {
  it('shows the bare glyph outside Home', () => {
    expect(boxBackground(<Icon name="bell" />)).toBeUndefined();
  });

  it('keeps the circle under the Home tile context', () => {
    expect(
      boxBackground(
        <IconTileContext.Provider value>
          <Icon name="bell" />
        </IconTileContext.Provider>,
      ),
    ).toBe(colors.iconSurface);
  });
});
