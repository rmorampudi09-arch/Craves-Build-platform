import React from 'react';
import {AppState, type AppStateStatus, Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {publicApiClient} from '../http/transport';
import {
  isAdvancedFeatureOn,
  loadAdvancedFeatures,
  parseAdvancedFeatures,
  refreshAdvancedFeatures,
  resetAdvancedFeaturesForTests,
  useAdvancedFeature,
} from './advancedFeatures';

jest.mock('../http/transport', () => ({
  publicApiClient: {
    get: jest.fn(),
  },
}));

const get = publicApiClient.get as jest.Mock;
const on = (...ids: string[]) => ({
  data: ids.map(id => ({id, enabled: true, available: true})),
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
}

const flush = () => act(async () => {});

describe('advancedFeatures gate', () => {
  let appStateHandler: (state: AppStateStatus) => void;
  const removeListener = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    get.mockReset();
    jest.spyOn(AppState, 'addEventListener').mockImplementation(
      (_type, handler) => {
        appStateHandler = handler as (state: AppStateStatus) => void;
        return {remove: removeListener};
      },
    );
    resetAdvancedFeaturesForTests();
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

  it('is off until loaded, and plain loads do not retry a failed read', async () => {
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
    act(() => tree.unmount());
  });

  it('re-reads when the app comes back to the foreground', async () => {
    get.mockResolvedValueOnce(on('taxonomy'));
    await loadAdvancedFeatures();
    expect(isAdvancedFeatureOn('taxonomy')).toBe(true);

    const second = deferred<ReturnType<typeof on>>();
    get.mockReturnValueOnce(second.promise);
    appStateHandler('background');
    appStateHandler('active');
    expect(get).toHaveBeenCalledTimes(2);
    expect(isAdvancedFeatureOn('taxonomy')).toBe(true);

    second.resolve(on());
    await flush();
    expect(isAdvancedFeatureOn('taxonomy')).toBe(false);
  });

  it('does not re-read for a state change that is not a return to active', async () => {
    get.mockResolvedValue(on('taxonomy'));
    await loadAdvancedFeatures();
    appStateHandler('inactive');
    appStateHandler('background');
    appStateHandler('active');
    appStateHandler('active');
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('registers one app-state listener however many loads happen', async () => {
    get.mockResolvedValue(on('taxonomy'));
    await loadAdvancedFeatures();
    await loadAdvancedFeatures();
    await refreshAdvancedFeatures();
    expect(AppState.addEventListener).toHaveBeenCalledTimes(1);
    expect(AppState.addEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    );
  });

  it('a failed launch read recovers on the next foreground', async () => {
    get.mockRejectedValueOnce(new Error('offline'));
    await loadAdvancedFeatures();
    expect(isAdvancedFeatureOn('taxonomy')).toBe(false);

    get.mockResolvedValueOnce(on('taxonomy'));
    appStateHandler('background');
    appStateHandler('active');
    await flush();
    expect(isAdvancedFeatureOn('taxonomy')).toBe(true);
  });

  it('a failed re-read turns every feature off', async () => {
    get.mockResolvedValueOnce(on('taxonomy'));
    await loadAdvancedFeatures();
    get.mockRejectedValueOnce(new Error('offline'));
    await refreshAdvancedFeatures();
    expect(isAdvancedFeatureOn('taxonomy')).toBe(false);
  });

  it('an older response cannot overwrite a newer one', async () => {
    const older = deferred<ReturnType<typeof on>>();
    const newer = deferred<ReturnType<typeof on>>();
    get.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const first = refreshAdvancedFeatures();
    const second = refreshAdvancedFeatures();

    newer.resolve(on('taxonomy'));
    await second;
    older.resolve(on());
    await first;
    expect(isAdvancedFeatureOn('taxonomy')).toBe(true);
  });

  it('reset removes the listener and drops an in-flight result', async () => {
    const inFlight = deferred<ReturnType<typeof on>>();
    get.mockReturnValueOnce(inFlight.promise);
    const read = loadAdvancedFeatures();
    resetAdvancedFeaturesForTests();
    expect(removeListener).toHaveBeenCalledTimes(1);

    inFlight.resolve(on('taxonomy'));
    await read;
    expect(isAdvancedFeatureOn('taxonomy')).toBe(false);
  });
});
