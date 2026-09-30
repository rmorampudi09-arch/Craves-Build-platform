import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Platform, StyleSheet, UIManager, View} from 'react-native';
import {BlurView} from 'expo-blur';
import {homeLiquidGlass} from '../../design/tokens';
import {LiquidGlassReflection} from './LiquidGlassReflection';
import {LiquidGlassSurface} from './LiquidGlassSurface';

describe('live backdrop rim', () => {
  const originalOS = Platform.OS;
  const versionDescriptor = Object.getOwnPropertyDescriptor(Platform, 'Version');
  const blurTarget = React.createRef<View>();
  let tree: renderer.ReactTestRenderer;
  let manager: jest.SpyInstance;
  let nodeHandle: jest.SpyInstance;

  beforeEach(() => {
    Platform.OS = 'android';
    Object.defineProperty(Platform, 'Version', {configurable: true, value: 36});
    manager = jest.spyOn(UIManager, 'getViewManagerConfig').mockReturnValue({Commands: {}});
    nodeHandle = jest.spyOn(require('react-native'), 'findNodeHandle').mockReturnValue(72);
    (blurTarget as React.MutableRefObject<View | null>).current = {} as View;
  });
  afterEach(() => {
    act(() => tree?.unmount());
    manager.mockRestore();
    nodeHandle.mockRestore();
    Platform.OS = originalOS;
    if (versionDescriptor) Object.defineProperty(Platform, 'Version', versionDescriptor);
  });
  const render = (target: typeof blurTarget | undefined = blurTarget) => {
    act(() => {
      tree = renderer.create(<LiquidGlassReflection blurTarget={target} cornerRadius={24} />);
    });
  };

  it('passes the real target tag without mounting a second BlurView', () => {
    render();
    const rim = tree.root.findAllByProps({testID: 'live-glass-reflection'})[0];
    expect(nodeHandle).toHaveBeenCalledWith(blurTarget.current);
    expect(rim.props.blurTargetTag).toBe(72);
    expect(tree.root.findAllByType(BlurView)).toHaveLength(0);
    expect(manager).toHaveBeenCalledWith('CravesGlassReflection');
  });
  it('leaves room for bent samples and never intercepts touches or accessibility', () => {
    render();
    const rim = tree.root.findAllByProps({testID: 'live-glass-reflection'})[0];
    expect(rim.props.glassRadius).toBe(24);
    expect(rim.props.edgeWidth).toBe(5);
    expect(rim.props.bendDistance).toBe(10);
    expect(rim.props.captureInset).toBeGreaterThan(rim.props.bendDistance);
    expect(StyleSheet.flatten(rim.props.style)).toMatchObject({
      top: -16, bottom: -16, left: -16, right: -16,
    });
    expect(rim.props.pointerEvents).toBe('none');
    expect(rim.props.accessible).toBe(false);
    expect(rim.props.importantForAccessibility).toBe('no-hide-descendants');
  });
  it('preserves center blur and keeps interactive foreground outside the native effect', () => {
    act(() => {
      tree = renderer.create(
        <LiquidGlassSurface appearance="home" blurTarget={blurTarget}>
          <View testID="foreground" />
        </LiquidGlassSurface>,
      );
    });
    const surface = tree.root.findAll(node => typeof node.props.onLayout === 'function')[0];
    act(() => surface.props.onLayout({nativeEvent: {layout: {width: 100, height: 40}}}));
    const captures = tree.root.findAllByType(BlurView).filter(node => node.props.intensity !== undefined);
    expect(captures.map(node => node.props.intensity)).toEqual([homeLiquidGlass.blurIntensity]);
    const rim = tree.root.findAllByProps({testID: 'live-glass-reflection'})[0];
    expect(rim.findAllByProps({testID: 'foreground'})).toHaveLength(0);
    expect(tree.root.findAllByProps({testID: 'foreground'}).length).toBeGreaterThan(0);
  });
  it('omits reflection without a backdrop reference', () => {
    act(() => {
      tree = renderer.create(<LiquidGlassReflection cornerRadius={24} />);
    });
    expect(tree.toJSON()).toBeNull();
    expect(manager).not.toHaveBeenCalled();
  });
  it.each([24, 31, 32])('retains the existing fallback on Android API %s', version => {
    Object.defineProperty(Platform, 'Version', {configurable: true, value: version});
    render();
    expect(tree.toJSON()).toBeNull();
    expect(manager).not.toHaveBeenCalled();
  });
  it('leaves iOS native glass unchanged', () => {
    Platform.OS = 'ios';
    render();
    expect(tree.toJSON()).toBeNull();
    expect(manager).not.toHaveBeenCalled();
  });
  it('fails silently if the native manager is unavailable', () => {
    manager.mockReturnValue(null);
    render();
    expect(tree.toJSON()).toBeNull();
  });
  it('fails silently if native capability lookup throws', () => {
    manager.mockImplementation(() => {throw new Error('unsupported');});
    render();
    expect(tree.toJSON()).toBeNull();
  });
  it('keeps an unattached backdrop safe without creating a capture', () => {
    (blurTarget as React.MutableRefObject<View | null>).current = null;
    render();
    expect(nodeHandle).not.toHaveBeenCalled();
    expect(tree.root.findAllByProps({testID: 'live-glass-reflection'})[0].props.blurTargetTag).toBe(-1);
  });
  it('fails silently if native target lookup throws', () => {
    nodeHandle.mockImplementation(() => {throw new Error('unmounted');});
    render();
    expect(tree.root.findAllByProps({testID: 'live-glass-reflection'})[0].props.blurTargetTag).toBe(-1);
  });
});
