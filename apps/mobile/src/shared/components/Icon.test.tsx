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

  it('draws a bare glyph at its full size and a tiled one at 74%', () => {
    const glyph = (element: React.ReactElement) => {
      let tree!: renderer.ReactTestRenderer;
      act(() => {
        tree = renderer.create(element);
      });
      const size = tree.root.findByType(View).props.children.props.size;
      act(() => tree.unmount());
      return size;
    };
    expect(glyph(<Icon name="bell" size={24} />)).toBe(24);
    expect(
      glyph(
        <IconTileContext.Provider value>
          <Icon name="bell" size={24} />
        </IconTileContext.Provider>,
      ),
    ).toBe(18);
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
