import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Image, ScrollView } from 'react-native';
import { KitchenImageCarousel } from './KitchenImageCarousel';

jest.mock('../../../design/reducedMotion', () => ({
  useReducedMotionPreference: () => false,
}));

describe('kitchen photo scrolling', () => {
  let tree: renderer.ReactTestRenderer;
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    act(() => tree?.unmount());
    jest.useRealTimers();
  });

  const photos = [
    'https://example.invalid/one.jpg',
    'https://example.invalid/two.jpg',
    'https://example.invalid/three.jpg',
  ];
  const render = (imageUrls = photos) => {
    act(() => {
      tree = renderer.create(
        <KitchenImageCarousel
          imageUrls={imageUrls}
          width={280}
          height={180}
          kitchenName="Test kitchen"
          active
          onPress={() => undefined}
        />,
      );
    });
    return tree.root.findByType(ScrollView);
  };

  it('renders distinct photos and moves the dot only when the photo position changes', () => {
    const scroll = render();
    expect(
      tree.root.findAllByType(Image).map(image => image.props.source.uri),
    ).toEqual(photos);
    act(() => jest.advanceTimersByTime(2_000));
    expect(
      tree.root.findAllByProps({ accessibilityLabel: 'Kitchen photo 1 of 3' }),
    ).not.toHaveLength(0);
    act(() =>
      scroll.props.onScroll({ nativeEvent: { contentOffset: { x: 280 } } }),
    );
    expect(
      tree.root.findAllByProps({ accessibilityLabel: 'Kitchen photo 2 of 3' }),
    ).not.toHaveLength(0);
    act(() =>
      scroll.props.onScrollEndDrag({
        nativeEvent: { contentOffset: { x: 560 } },
      }),
    );
    expect(
      tree.root.findAllByProps({ accessibilityLabel: 'Kitchen photo 3 of 3' }),
    ).not.toHaveLength(0);
  });

  it('does not show cycling dots or allow scrolling for a single photo', () => {
    const scroll = render([photos[0]]);
    expect(scroll.props.scrollEnabled).toBe(false);
    expect(
      tree.root.findAll(node =>
        String(node.props.accessibilityLabel).startsWith('Kitchen photo'),
      ),
    ).toHaveLength(0);
  });
});
