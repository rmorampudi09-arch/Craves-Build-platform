import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {CLOUD_COVERED_AT, CLOUD_FILL_MS, CloudFill, makeCloudPuffs} from './CloudFill';

describe('cloud fill', () => {
  let seed = 1;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  it('spreads puffs across the area and lets every puff finish growing by the end', () => {
    const puffs = makeCloudPuffs(360, 96, 'top', random);
    expect(puffs).toHaveLength(9);
    for (const puff of puffs) {
      expect(puff.delay).toBeGreaterThan(0);
      expect(puff.delay + 0.58).toBeLessThanOrEqual(1);
      expect(puff.x).toBeGreaterThan(-20);
      expect(puff.x).toBeLessThan(380);
    }
    expect(new Set(puffs.map(puff => Math.round(puff.size))).size).toBeGreaterThan(1);
  });

  it('rises from the bottom edge and reaches past the middle of a tall header', () => {
    const height = 110;
    for (const puff of makeCloudPuffs(360, height, 'bottom', random)) {
      expect(Math.abs(puff.y - height)).toBeLessThanOrEqual(18);
      // The solid layer finishes the cover; the puffs only need to climb past halfway.
      expect(puff.y - puff.size / 2).toBeLessThan(height / 2);
    }
  });

  it('reports covered part way through the fill, and clear again after it reverses', () => {
    jest.useFakeTimers();
    const onCoveredChange = jest.fn();
    const render = (active: boolean) => (
      <CloudFill active={active} color="#FFFFFF" edge="bottom" height={110} width={360} onCoveredChange={onCoveredChange} />
    );
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(render(false));
    });
    onCoveredChange.mockClear();
    act(() => tree.update(render(true)));
    act(() => jest.advanceTimersByTime(CLOUD_FILL_MS * CLOUD_COVERED_AT - 10));
    expect(onCoveredChange).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(20));
    expect(onCoveredChange).toHaveBeenLastCalledWith(true);
    act(() => tree.update(render(false)));
    act(() => jest.advanceTimersByTime(CLOUD_FILL_MS));
    expect(onCoveredChange).toHaveBeenLastCalledWith(false);
    act(() => tree.unmount());
    jest.useRealTimers();
  });
});
