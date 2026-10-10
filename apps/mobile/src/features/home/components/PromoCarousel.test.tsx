import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { FlatList } from 'react-native';
import { PromoCarousel, PROMO_AUTO_ADVANCE_MS } from './HomePromoAndKitchens';

describe('home banner carousel', () => {
  let tree: renderer.ReactTestRenderer;
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    act(() => tree?.unmount());
    jest.useRealTimers();
  });

  const banners = ['one', 'two', 'three'].map((label, index) => ({
    id: `00000000-0000-4000-8000-00000000000${index}`,
    label,
    imageUrl: `https://example.invalid/${label}.jpg`,
  }));
  const position = (n: number) =>
    tree.root.findAllByProps({ accessibilityLabel: `Banner ${n} of 3` });

  it('advances every 2 seconds and gives a manual swipe a full interval', () => {
    act(() => {
      tree = renderer.create(
        <PromoCarousel
          banners={banners}
          active
          width={300}
          onPress={() => undefined}
        />,
      );
    });
    expect(PROMO_AUTO_ADVANCE_MS).toBe(2_000);
    act(() => jest.advanceTimersByTime(2_000));
    expect(position(2)).not.toHaveLength(0);

    const list = tree.root.findByType(FlatList);
    act(() => {
      list.props.onScrollBeginDrag();
      list.props.onMomentumScrollEnd({
        nativeEvent: { contentOffset: { x: 600 } },
      });
    });
    expect(position(3)).not.toHaveLength(0);
    act(() => jest.advanceTimersByTime(1_900));
    expect(position(3)).not.toHaveLength(0);
    act(() => jest.advanceTimersByTime(100));
    expect(position(1)).not.toHaveLength(0);
  });
});
