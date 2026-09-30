import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Platform, StyleSheet } from 'react-native';
import { Rect } from 'react-native-svg';
import { homeLiquidGlass } from '../../design/tokens';
import { LiquidGlassSurface } from './LiquidGlassSurface';

describe('image capsule optics', () => {
  let tree: renderer.ReactTestRenderer;
  afterEach(() => {
    act(() => tree?.unmount());
    jest.restoreAllMocks();
  });
  const render = (
    variant: 'image' | 'navigation',
    appearance: 'default' | 'home' = 'default',
  ) => {
    act(() => {
      tree = renderer.create(
        <LiquidGlassSurface variant={variant} appearance={appearance} />,
      );
    });
    return tree.root.findAll(
      node => node.props.blurMethod === 'dimezisBlurViewSdk31Plus',
    )[0];
  };
  it('reduces photo capsule blur without changing navigation blur', () => {
    expect(render('image').props.intensity).toBe(38);
    act(() => tree.unmount());
    expect(render('navigation').props.intensity).toBe(66);
  });
  it('keeps the stronger reflective rim inside the measured capsule', () => {
    render('image');
    const surface = tree.root.findAll(
      node => typeof node.props.onLayout === 'function',
    )[0];
    act(() =>
      surface.props.onLayout({
        nativeEvent: { layout: { width: 72, height: 36 } },
      }),
    );
    const rim = tree.root
      .findAllByType(Rect)
      .find(node => node.props.strokeWidth === 1.8);
    expect(rim?.props.x).toBe(0.9);
    expect(rim?.props.width).toBe(70.2);
    expect(rim?.props.rx).toBe(17.1);
  });
  it('uses the same lower blur for home capsules and the home menu', () => {
    expect(homeLiquidGlass.blurIntensity).toBe(10);
    expect(render('image', 'home').props.intensity).toBe(
      homeLiquidGlass.blurIntensity,
    );
    act(() => tree.unmount());
    expect(render('navigation', 'home').props.intensity).toBe(
      homeLiquidGlass.blurIntensity,
    );
  });
  it.each(['image', 'navigation'] as const)(
    'uses a light tint and white wash for home %s glass',
    variant => {
      expect(render(variant, 'home').props.tint).toBe('light');
      expect(
        tree.root.findAll(
          node =>
            node.props.pointerEvents === 'none' &&
            StyleSheet.flatten(node.props.style)?.backgroundColor ===
              homeLiquidGlass.tintColor,
        ).length,
      ).toBeGreaterThan(0);
    },
  );
  it('keeps unsupported Android glass light instead of applying the old dark fallback', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue(30 as never);
    render('image', 'home');
    expect(
      tree.root.findAll(
        node =>
          node.props.pointerEvents === 'none' &&
          StyleSheet.flatten(node.props.style)?.backgroundColor ===
            homeLiquidGlass.fallbackTintColor,
      ).length,
    ).toBeGreaterThan(0);
  });
  it.each(['image', 'navigation'] as const)(
    'removes the drawn outline from home %s glass',
    variant => {
      render(variant, 'home');
      const surface = tree.root.findAll(
        node => typeof node.props.onLayout === 'function',
      )[0];
      act(() =>
        surface.props.onLayout({
          nativeEvent: { layout: { width: 72, height: 36 } },
        }),
      );
      expect(
        tree.root
          .findAllByType(Rect)
          .some(node => node.props.stroke || node.props.strokeWidth),
      ).toBe(false);
      const edge = tree.root
        .findAllByType(Rect)
        .find(node => node.props.testID === 'home-glass-edge-light');
      expect(edge?.props.mask).toContain('edgeMask');
      expect(edge?.props.rx).toBe(18);
      const glow = tree.root
        .findAllByType(Rect)
        .find(node => node.props.testID === 'home-glass-inner-glow');
      expect(glow?.props.mask).toContain('glowMask');
      expect(glow?.props.fill).toBe('white');
      expect(glow?.props.fillOpacity).toBe(0.2);
    },
  );
  it('keeps zero and tiny layouts safe without affecting the tap surface', () => {
    render('image', 'home');
    const surface = tree.root.findAll(
      node => typeof node.props.onLayout === 'function',
    )[0];
    expect(tree.root.findAllByType(Rect)).toHaveLength(0);
    act(() =>
      surface.props.onLayout({
        nativeEvent: { layout: { width: 3, height: 2 } },
      }),
    );
    for (const rect of tree.root.findAllByType(Rect)) {
      expect(rect.props.width).toBeGreaterThanOrEqual(0);
      expect(rect.props.height).toBeGreaterThanOrEqual(0);
      expect(rect.props.rx).toBeGreaterThanOrEqual(0);
    }
  });
});
