import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Rect} from 'react-native-svg';
import {LiquidGlassSurface} from './LiquidGlassSurface';

describe('image capsule optics', () => {
  let tree: renderer.ReactTestRenderer;
  afterEach(() => act(() => tree?.unmount()));
  const render = (variant: 'image' | 'navigation') => {
    act(() => { tree = renderer.create(<LiquidGlassSurface variant={variant} />); });
    return tree.root.findAll(node => node.props.blurMethod === 'dimezisBlurViewSdk31Plus')[0];
  };
  it('reduces photo capsule blur without changing navigation blur', () => {
    expect(render('image').props.intensity).toBe(38);
    act(() => tree.unmount());
    expect(render('navigation').props.intensity).toBe(66);
  });
  it('keeps the stronger reflective rim inside the measured capsule', () => {
    render('image');
    const surface=tree.root.findAll(node => typeof node.props.onLayout === 'function')[0];
    act(() => surface.props.onLayout({nativeEvent: {layout: {width: 72, height: 36}}}));
    const rim=tree.root.findAllByType(Rect).find(node => node.props.strokeWidth === 1.8);
    expect(rim?.props.x).toBe(0.9);
    expect(rim?.props.width).toBe(70.2);
    expect(rim?.props.rx).toBe(17.1);
  });
});
