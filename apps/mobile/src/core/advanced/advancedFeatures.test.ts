import React from 'react';
import {Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {publicApiClient} from '../http/transport';
import {
  isAdvancedFeatureOn,
  loadAdvancedFeatures,
  parseAdvancedFeatures,
  resetAdvancedFeaturesForTests,
  useAdvancedFeature,
} from './advancedFeatures';

jest.mock('../http/transport', () => ({
  publicApiClient: {
    get: jest.fn(),
  },
}));

const get = publicApiClient.get as jest.Mock;

describe('advancedFeatures gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    get.mockReset();
    resetAdvancedFeaturesForTests();
  });

  it('keeps only enabled and available known ids', () => {
    expect(
      parseAdvancedFeatures([
        {id: 'taxonomy', enabled: true, available: true},
        {id: 'food-facts', enabled: true, available: false},
        {id: 'something-new', enabled: true, available: true},
      ]),
    ).toEqual(new Set(['taxonomy']));
  });

  it('rejects a non-array body', () => {
    expect(parseAdvancedFeatures({})).toBeNull();
  });

  it('treats every feature as off when the call fails', async () => {
    get.mockRejectedValueOnce(new Error('offline'));
    await expect(loadAdvancedFeatures()).resolves.toEqual(new Set());
    expect(isAdvancedFeatureOn('taxonomy')).toBe(false);
  });

  it('asks the server once for concurrent callers', async () => {
    get.mockResolvedValue({
      data: [{id: 'taxonomy', enabled: true, available: true}],
    });
    await Promise.all([loadAdvancedFeatures(), loadAdvancedFeatures()]);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(
      '/api/v1/advanced/features',
      expect.anything(),
    );
    expect(isAdvancedFeatureOn('taxonomy')).toBe(true);
  });

  it('is off until loaded, and a failed load is not retried this session', async () => {
    expect(isAdvancedFeatureOn('taxonomy')).toBe(false);
    get.mockRejectedValueOnce(new Error('offline'));
    await loadAdvancedFeatures();
    await loadAdvancedFeatures();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('ignores malformed entries without dropping valid ones', () => {
    expect(
      parseAdvancedFeatures([
        null,
        {id: 'taxonomy', enabled: 'yes', available: true},
        {id: 'food-lists', enabled: true, available: true},
      ]),
    ).toEqual(new Set(['food-lists']));
  });

  it('re-renders the hook when the load resolves', async () => {
    get.mockResolvedValue({
      data: [{id: 'taxonomy', enabled: true, available: true}],
    });
    function Probe() {
      return React.createElement(
        Text,
        null,
        useAdvancedFeature('taxonomy') ? 'on' : 'off',
      );
    }
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(React.createElement(Probe));
    });
    expect(tree.root.findByType(Text).props.children).toBe('on');
    expect(get).toHaveBeenCalledTimes(1);
  });
});
