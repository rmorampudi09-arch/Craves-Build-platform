import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Animated, FlatList } from 'react-native';
import { PromoCarousel, PROMO_AUTO_ADVANCE_MS } from './HomePromoAndKitchens';

jest.mock('../../../design/reducedMotion', () => ({
  useReducedMotionPreference: () => false,
}));

describe('home banner carousel', () => {
  let tree: renderer.ReactTestRenderer;
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    act(() => tree?.unmount());
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  const banners = ['one', 'two', 'three'].map((label, index) => ({
    id: `00000000-0000-4000-8000-00000000000${index}`,
    label,
    imageUrl: `https://example.invalid/${label}.jpg`,
  }));
  const render = () =>
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
  // Where each automatic slide goes, in list offset (300 per banner).
  const slideTargets = (timing: jest.SpyInstance) =>
    timing.mock.calls.map(([, config]) => config.toValue);
  const swipeTo = (x: number) => {
    const list = tree.root.findByType(FlatList);
    act(() => {
      list.props.onScrollBeginDrag();
      list.props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x } } });
    });
  };

  it('has no dots under the banners', () => {
    render();
    expect(
      tree.root.findAll(node =>
        String(node.props.accessibilityLabel ?? '').startsWith('Banner '),
      ),
    ).toHaveLength(0);
  });

  it('advances every 4 seconds and gives a manual swipe a full interval', () => {
    const timing = jest.spyOn(Animated, 'timing');
    render();
    expect(PROMO_AUTO_ADVANCE_MS).toBe(4_000);
    act(() => jest.advanceTimersByTime(4_000));
    expect(slideTargets(timing)).toEqual([300]);

    swipeTo(600);
    act(() => jest.advanceTimersByTime(3_900));
    expect(slideTargets(timing)).toEqual([300]);
    act(() => jest.advanceTimersByTime(100));
    expect(slideTargets(timing)).toEqual([300, 900]);
  });

  it('slides forward from the last banner onto a copy of the first, never rewinding', () => {
    const timing = jest.spyOn(Animated, 'timing');
    render();
    expect(tree.root.findByType(FlatList).props.data).toHaveLength(4);
    act(() => jest.advanceTimersByTime(3 * PROMO_AUTO_ADVANCE_MS));
    expect(slideTargets(timing)).toEqual([300, 600, 900]);
    timing.mock.calls.forEach(([, config]) =>
      expect(config.duration).toBeGreaterThanOrEqual(600),
    );
  });

  it('jumps back to the real first banner when a swipe lands on the copy', () => {
    const scrollToOffset = jest.spyOn(FlatList.prototype, 'scrollToOffset');
    const timing = jest.spyOn(Animated, 'timing');
    render();
    swipeTo(900);
    expect(scrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: false });
    act(() => jest.advanceTimersByTime(PROMO_AUTO_ADVANCE_MS));
    expect(slideTargets(timing)).toEqual([300]);
  });
});
