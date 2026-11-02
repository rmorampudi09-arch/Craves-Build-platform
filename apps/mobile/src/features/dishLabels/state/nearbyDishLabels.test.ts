import React from 'react';
import {act, create} from 'react-test-renderer';
import {
  isAdvancedFeatureOn,
  loadAdvancedFeatures,
} from '../../../core/advanced/advancedFeatures';
import {taxonomyApi, type DishLabelCodes} from '../api/taxonomyApi';
import {
  forgetNearbyDishLabels,
  getNearbyDishLabelsSnapshot,
  loadNearbyDishLabels,
  resetNearbyDishLabelsForTests,
  useNearbyDishLabels,
} from './nearbyDishLabels';

jest.mock('../api/taxonomyApi', () => ({
  taxonomyApi: {vocabulary: jest.fn(), lookup: jest.fn()},
}));
jest.mock('../../../core/advanced/advancedFeatures', () => ({
  isAdvancedFeatureOn: jest.fn(),
  loadAdvancedFeatures: jest.fn(),
}));

const vocabulary = jest.mocked(taxonomyApi.vocabulary);
const lookup = jest.mocked(taxonomyApi.lookup);
const VOCABULARY = {
  cuisines: [{code: 'north-indian', kind: 'CUISINE' as const, parentCode: null, name: 'North Indian'}],
  diets: [],
};

const ids = (count: number, from = 0) => Array.from({length: count}, (_, i) => `dish-${from + i}`);
// The server answers only for dishes that carry labels: every 10th dish has none.
const labelled = (id: string): DishLabelCodes | null =>
  Number(id.split('-')[1]) % 10 === 9 ? null : {menuItemId: id, cuisines: ['north-indian'], diets: []};
const answer = async (asked: string[]) =>
  asked.map(labelled).filter((dish): dish is DishLabelCodes => dish !== null);

// The gate only reads "on" once the feature list has loaded, as at a cold start.
let gateAfterLoad: boolean;
let gate: boolean;
let now: number;

beforeEach(() => {
  jest.resetAllMocks();
  now = 1_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  resetNearbyDishLabelsForTests();
  gateAfterLoad = true;
  gate = false;
  jest.mocked(loadAdvancedFeatures).mockImplementation(async () => {
    await Promise.resolve();
    gate = gateAfterLoad;
    return new Set();
  });
  jest.mocked(isAdvancedFeatureOn).mockImplementation(() => gate);
  vocabulary.mockResolvedValue(VOCABULARY);
  lookup.mockImplementation(answer);
});

afterEach(() => {
  jest.mocked(Date.now).mockRestore();
});

describe('loadNearbyDishLabels', () => {
  it('splits 250 ids into 100, 100 and 50', async () => {
    const result = await loadNearbyDishLabels(ids(250));
    expect(lookup.mock.calls.map(([asked]) => asked.length)).toEqual([100, 100, 50]);
    expect(lookup.mock.calls[0][0]).toEqual(ids(100));
    expect(lookup.mock.calls[2][0]).toEqual(ids(50, 200));
    expect(result?.byId.size).toBe(ids(250).filter(id => labelled(id)).length);
    expect(result?.vocabulary).toBe(VOCABULARY);
  });

  it('asks only for ids it has not seen', async () => {
    await loadNearbyDishLabels(ids(250));
    lookup.mockClear();
    const result = await loadNearbyDishLabels([...ids(250), 'dish-new']);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith(['dish-new']);
    expect(result?.byId.get('dish-0')?.cuisines).toEqual(['north-indian']);
    expect(vocabulary).toHaveBeenCalledTimes(1);
  });

  it('returns null when the gate is off', async () => {
    gateAfterLoad = false;
    expect(await loadNearbyDishLabels(ids(3))).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
    expect(vocabulary).not.toHaveBeenCalled();
  });

  it('returns null and keeps no snapshot when a chunk fails', async () => {
    await loadNearbyDishLabels(ids(3));
    expect(getNearbyDishLabelsSnapshot()).not.toBeNull();
    lookup.mockRejectedValueOnce(new Error('network'));
    expect(await loadNearbyDishLabels(ids(3, 1000))).toBeNull();
    expect(getNearbyDishLabelsSnapshot()).toBeNull();
  });

  it('returns null when the vocabulary fails and tries it again next time', async () => {
    vocabulary.mockRejectedValueOnce(new Error('network'));
    expect(await loadNearbyDishLabels(ids(3))).toBeNull();
    expect(await loadNearbyDishLabels(ids(3))).not.toBeNull();
  });

  it('the snapshot is the latest result', async () => {
    expect(getNearbyDishLabelsSnapshot()).toBeNull();
    const first = await loadNearbyDishLabels(ids(3));
    expect(getNearbyDishLabelsSnapshot()).toBe(first);
    const second = await loadNearbyDishLabels(ids(2, 50));
    expect(getNearbyDishLabelsSnapshot()).toBe(second);
    expect([...second!.byId.keys()]).toEqual(['dish-50', 'dish-51']);
  });

  it('a slow older load does not replace a newer snapshot', async () => {
    let release!: () => void;
    lookup.mockImplementationOnce(
      asked => new Promise<DishLabelCodes[]>(resolve => (release = () => resolve(answer(asked)))),
    );
    const older = loadNearbyDishLabels(ids(2));
    await new Promise<void>(resolve => setImmediate(resolve));
    const newer = await loadNearbyDishLabels(ids(2, 50));
    release();
    await older;
    expect(getNearbyDishLabelsSnapshot()).toBe(newer);
  });
});

describe('refreshing cached labels', () => {
  it('forgetting a dish makes the next load ask for it again', async () => {
    await loadNearbyDishLabels(['dish-0', 'dish-1']);
    lookup.mockClear();
    forgetNearbyDishLabels(['dish-0']);
    expect([...getNearbyDishLabelsSnapshot()!.byId.keys()]).toEqual(['dish-1']);
    const result = await loadNearbyDishLabels(['dish-0', 'dish-1']);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith(['dish-0']);
    expect([...result!.byId.keys()]).toEqual(['dish-0', 'dish-1']);
  });

  it('forgetting leaves a missing snapshot missing', () => {
    forgetNearbyDishLabels(['dish-0']);
    expect(getNearbyDishLabelsSnapshot()).toBeNull();
  });

  it('entries older than 10 minutes are looked up again', async () => {
    await loadNearbyDishLabels(['dish-0', 'dish-9']);
    lookup.mockClear();
    now += 10 * 60 * 1000;
    await loadNearbyDishLabels(['dish-0', 'dish-9']);
    expect(lookup).not.toHaveBeenCalled();
    now += 1;
    await loadNearbyDishLabels(['dish-0', 'dish-9']);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith(['dish-0', 'dish-9']);
  });
});

describe('useNearbyDishLabels', () => {
  it('loads the ids, then reloads when they change', async () => {
    let latest!: ReturnType<typeof useNearbyDishLabels>;
    const Probe = ({list}: {list: string[]}) => {
      latest = useNearbyDishLabels(list);
      return null;
    };
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(React.createElement(Probe, {list: ids(2)}));
    });
    expect(latest.pending).toBe(false);
    expect([...latest.labels!.byId.keys()]).toEqual(['dish-0', 'dish-1']);

    await act(async () => {
      tree.update(React.createElement(Probe, {list: ids(2, 50)}));
    });
    expect(latest.pending).toBe(false);
    expect([...latest.labels!.byId.keys()]).toEqual(['dish-50', 'dish-51']);
    await act(async () => tree.unmount());
  });
});
