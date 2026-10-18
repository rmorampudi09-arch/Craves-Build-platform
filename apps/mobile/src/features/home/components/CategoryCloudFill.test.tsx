import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {CLOUD_FILL_MS, CLOUD_LABELS_ON_COLOR_AT, CategoryCloudFill, makeCloudPuffs} from './CategoryCloudFill';
import {HomeCategoryRail} from './HomeCategoryRail';
import {Text} from 'react-native';

describe('category cloud fill', () => {
  it('spreads puffs across the row and lets every puff finish growing by the end', () => {
    let seed = 1;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const puffs = makeCloudPuffs(360, random);
    expect(puffs).toHaveLength(9);
    for (const puff of puffs) {
      expect(puff.delay).toBeGreaterThan(0);
      expect(puff.delay + 0.58).toBeLessThanOrEqual(1);
      expect(puff.x).toBeGreaterThan(-20);
      expect(puff.x).toBeLessThan(380);
    }
    expect(new Set(puffs.map(puff => Math.round(puff.size))).size).toBeGreaterThan(1);
  });

  it('reports the row as covered part way through the fill, and white again after unpinning', () => {
    jest.useFakeTimers();
    const onCoveredChange = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<CategoryCloudFill active={false} color="#E2341F" width={360} onCoveredChange={onCoveredChange} />);
    });
    onCoveredChange.mockClear();
    act(() => tree.update(<CategoryCloudFill active color="#E2341F" width={360} onCoveredChange={onCoveredChange} />));
    act(() => jest.advanceTimersByTime(CLOUD_FILL_MS * CLOUD_LABELS_ON_COLOR_AT - 10));
    expect(onCoveredChange).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(20));
    expect(onCoveredChange).toHaveBeenLastCalledWith(true);
    act(() => tree.update(<CategoryCloudFill active={false} color="#E2341F" width={360} onCoveredChange={onCoveredChange} />));
    act(() => jest.advanceTimersByTime(CLOUD_FILL_MS));
    expect(onCoveredChange).toHaveBeenLastCalledWith(false);
    act(() => tree.unmount());
    jest.useRealTimers();
  });

  it('turns rail labels white on the red fill', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<HomeCategoryRail selectedCategory={null} onSelect={jest.fn()} onColor />);
    });
    const label = tree.root.findAllByType(Text)[0];
    expect(Object.assign({}, ...[label.props.style].flat(2).filter(Boolean)).color).toBe('#FFFFFF');
    act(() => tree.unmount());
  });
});
