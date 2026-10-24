import React from 'react';
import renderer, { act } from 'react-test-renderer';
import {
  Animated,
  AppState,
  Image,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  KITCHEN_PHOTO_ADVANCE_MS,
  KitchenImageCarousel,
} from './KitchenImageCarousel';

let mockReducedMotion = false;
jest.mock('../../../design/reducedMotion', () => ({
  useReducedMotionPreference: () => mockReducedMotion,
}));

describe('kitchen photo slideshow', () => {
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
  const render = (imageUrls = photos, startDelayMs?: number) => {
    act(() => {
      tree = renderer.create(
        <KitchenImageCarousel
          imageUrls={imageUrls}
          width={280}
          height={180}
          kitchenName="Test kitchen"
          active
          onPress={() => undefined}
          startDelayMs={startDelayMs}
        />,
      );
    });
  };
  const shows = (n: number, of = 3) =>
    tree.root.findAllByProps({
      accessibilityLabel: `Kitchen photo ${n} of ${of}`,
    }).length > 0;
  const tick = (ms = KITCHEN_PHOTO_ADVANCE_MS) =>
    act(() => jest.advanceTimersByTime(ms));

  it('changes photo calmly, every 4 seconds', () => {
    expect(KITCHEN_PHOTO_ADVANCE_MS).toBe(4_000);
    render();
    tick(3_999);
    expect(shows(1)).toBe(true);
    tick(1);
    expect(shows(2)).toBe(true);
  });

  it('loops forward from the last photo onto a copy of the first, never rewinding', () => {
    const timing = jest.spyOn(Animated, 'timing');
    render();
    // Every photo, plus the copy of the first that the last one fades into.
    expect(
      tree.root.findAllByType(Image).map(image => image.props.source.uri),
    ).toEqual([...photos, photos[0]]);
    tick();
    tick();
    tick();
    expect(shows(1)).toBe(true);
    const targets = timing.mock.calls.map(([, config]) => config.toValue);
    expect(targets).toEqual([1, 2, 3]);
    timing.mock.calls.forEach(([, config]) => {
      expect(config.duration).toBeGreaterThanOrEqual(600);
      expect(config.useNativeDriver).toBe(true);
    });
  });

  it('staggers its start so a row of cards does not change together', () => {
    render(photos, 1_000);
    tick();
    expect(shows(1)).toBe(true);
    tick(1_000);
    expect(shows(2)).toBe(true);
  });

  it('keeps the kitchen card press on the photo', () => {
    render();
    const photo = tree.root.findAllByProps({
      accessibilityLabel: 'Open Test kitchen, photo 1',
    })[0];
    expect(photo.props.accessibilityRole).toBe('button');
    expect(typeof photo.props.onPress).toBe('function');
  });

  it('pauses while the app is in the background', () => {
    const listener = jest.spyOn(AppState, 'addEventListener');
    listener.mockClear();
    render();
    const onAppState = listener.mock.calls[listener.mock.calls.length - 1][1];
    act(() => onAppState('background'));
    tick(8_000);
    expect(shows(1)).toBe(true);
    act(() => onAppState('active'));
    tick();
    expect(shows(2)).toBe(true);
  });

  it('respects reduced motion', () => {
    mockReducedMotion = true;
    render();
    tick(8_000);
    expect(shows(1)).toBe(true);
  });

  it('puts the kitchen page dots in a glass capsule with a wide active dot', () => {
    act(() => {
      tree = renderer.create(
        <KitchenImageCarousel
          imageUrls={photos}
          width={390}
          height={293}
          kitchenName="Test kitchen"
          active
          onPress={() => undefined}
          pager="glass-right"
        />,
      );
    });
    const pager = tree.root.find(
      node =>
        typeof node.type !== 'string' &&
        node.props.accessibilityLabel === 'Kitchen photo 1 of 3',
    );
    expect(pager.props.cornerRadius).toBe(14);
    expect(pager.props.blurTarget).toBeDefined();
    const widths = pager.props.children.map(
      (dot: { props: { style: StyleProp<ViewStyle> } }) =>
        StyleSheet.flatten(dot.props.style).width,
    );
    expect(widths).toEqual([16, 6, 6]);
  });

  it('shows no dots and no copy for a single photo', () => {
    render([photos[0]]);
    expect(tree.root.findAllByType(Image)).toHaveLength(1);
    expect(
      tree.root.findAll(node =>
        String(node.props.accessibilityLabel).startsWith('Kitchen photo'),
      ),
    ).toHaveLength(0);
  });
});
