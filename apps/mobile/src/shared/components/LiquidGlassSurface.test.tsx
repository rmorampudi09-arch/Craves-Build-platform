import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Mask, Rect, Stop } from 'react-native-svg';
import { homeLiquidGlass } from '../../design/tokens';
import { LiquidGlassSurface } from './LiquidGlassSurface';

describe('image capsule optics', () => {
  let tree: renderer.ReactTestRenderer;
  afterEach(() => act(() => tree?.unmount()));
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
    expect(render('image', 'home').props.intensity).toBe(
      homeLiquidGlass.blurIntensity,
    );
    act(() => tree.unmount());
    expect(render('navigation', 'home').props.intensity).toBe(
      homeLiquidGlass.blurIntensity,
    );
  });
  it('preserves the approved blur and center lighting while changing only edge optics', () => {
    expect(homeLiquidGlass.blurIntensity).toBe(22);
    expect(homeLiquidGlass.blurReductionFactor).toBe(2.5);
    expect(homeLiquidGlass.topLightOpacity).toBe(0.18);
    expect(homeLiquidGlass.bottomLightOpacity).toBe(0.08);
  });
  it.each(['image', 'navigation'] as const)(
    'pairs outer and inner edge bands without covering the center of %s glass',
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
      const innerEdge = tree.root
        .findAllByType(Rect)
        .find(node => node.props.testID === 'home-glass-inner-edge-light');
      expect(innerEdge?.props.mask).toContain('innerEdgeMask');
      expect(innerEdge?.props.rx).toBe(18);
      const masks = tree.root.findAllByType(Mask);
      expect(masks).toHaveLength(2);
      for (const mask of masks) {
        expect(mask.props.maskType).toBe('luminance');
        const center = mask.findAllByType(Rect).find(node => node.props.fill === 'black');
        expect(center?.props.x).toBe(5);
        expect(center?.props.width).toBe(62);
        expect(center?.props.height).toBe(26);
      }
      expect(tree.root.findAllByType(Stop).some(
        node => node.props.stopOpacity === homeLiquidGlass.highlightOpacity,
      )).toBe(true);
      expect(tree.root.findAllByType(Stop).some(
        node => node.props.stopOpacity === homeLiquidGlass.innerHighlightOpacity,
      )).toBe(true);
    },
  );
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
