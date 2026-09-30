import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { AppState, Image, ScrollView } from 'react-native';
import { KitchenImageCarousel } from './KitchenImageCarousel';

let mockReducedMotion = false;
jest.mock('../../../design/reducedMotion', () => ({
  useReducedMotionPreference: () => mockReducedMotion,
}));

describe('kitchen photo scrolling', () => {
  let tree: renderer.ReactTestRenderer;
  const originalAppState = AppState.currentState;
  beforeEach(() => {
    jest.useFakeTimers();
    mockReducedMotion = false;
    AppState.currentState = 'active';
  });
  afterEach(() => {
    act(() => tree?.unmount());
    jest.restoreAllMocks();
    AppState.currentState = originalAppState;
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
      scroll.props.onMomentumScrollEnd({
        nativeEvent: { contentOffset: { x: 560 } },
      }),
    );
    expect(
      tree.root.findAllByProps({ accessibilityLabel: 'Kitchen photo 3 of 3' }),
    ).not.toHaveLength(0);
  });

  it('disables manual photo paging even when there are multiple photos', () => {
    const scroll = render();
    expect(scroll.props.scrollEnabled).toBe(false);
    expect(scroll.props.onScrollBeginDrag).toBeUndefined();
    expect(scroll.props.onScrollEndDrag).toBeUndefined();
    expect(jest.getTimerCount()).toBeGreaterThan(0);
  });

  it('still advances and wraps automatically with manual paging disabled', () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo');
    const scroll = render();
    scrollTo.mockClear();
    act(() => jest.advanceTimersByTime(2_000));
    expect(scrollTo).toHaveBeenLastCalledWith({x: 280, animated: true});
    act(() => scroll.props.onScroll({nativeEvent: {contentOffset: {x: 280}}}));
    act(() => jest.advanceTimersByTime(2_000));
    expect(scrollTo).toHaveBeenLastCalledWith({x: 560, animated: true});
    act(() => scroll.props.onMomentumScrollEnd({nativeEvent: {contentOffset: {x: 560}}}));
    act(() => jest.advanceTimersByTime(2_000));
    expect(scrollTo).toHaveBeenLastCalledWith({x: 0, animated: true});
    expect(scroll.props.scrollEnabled).toBe(false);
  });

  it('preserves the kitchen card press without exposing manual photo paging', () => {
    render();
    const photo = tree.root.findAllByProps({accessibilityLabel: 'Open Test kitchen, photo 1'})[0];
    expect(photo.props.accessibilityRole).toBe('button');
    expect(typeof photo.props.onPress).toBe('function');
  });

  it('pauses automatic paging when the app goes into the background', () => {
    const listener = jest.spyOn(AppState, 'addEventListener');
    listener.mockClear();
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo');
    render();
    const onAppState = listener.mock.calls[listener.mock.calls.length - 1][1];
    scrollTo.mockClear();
    act(() => onAppState('background'));
    act(() => jest.advanceTimersByTime(4_000));
    expect(scrollTo).not.toHaveBeenCalled();
    act(() => onAppState('active'));
    act(() => jest.advanceTimersByTime(2_000));
    expect(scrollTo).toHaveBeenLastCalledWith({x: 280, animated: true});
  });

  it('respects reduced motion with automatic-only photos', () => {
    mockReducedMotion = true;
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo');
    const scroll = render();
    scrollTo.mockClear();
    act(() => jest.advanceTimersByTime(4_000));
    expect(scrollTo).not.toHaveBeenCalled();
    expect(scroll.props.scrollEnabled).toBe(false);
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
