import React from 'react';
import {StatusBar, Text} from 'react-native';
import renderer, {act, type ReactTestInstance} from 'react-test-renderer';
import {SafeAreaProvider, useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppApiError} from '../../../core/http/apiError';
import {sessionManager} from '../../auth/api/sessionManager';
import {accountDeletionApi} from '../api/accountDeletionApi';
import {AccountDeletionProvider, useAccountDeletion} from './AccountDeletionProvider';
import {useDeletionStripVisible} from './useDeletionStripVisible';

let mockIdentity: Record<string, unknown> | null;
let mockKeepItPending = false;

jest.mock('../../../app/store/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) =>
    select({auth: {identity: mockIdentity, keepItPending: mockKeepItPending}}),
}));
jest.mock('../../auth/api/sessionManager', () => ({sessionManager: {refresh: jest.fn()}}));
jest.mock('../api/accountDeletionApi', () => ({accountDeletionApi: {keep: jest.fn()}}));

// 12:00 UTC is 5 Dec on every phone from UTC-12 to UTC+11, so the date needs no fixed time zone.
const DUE = '2026-12-05T12:00:00Z';
const metrics = {
  frame: {x: 0, y: 0, width: 360, height: 760},
  insets: {top: 24, right: 0, bottom: 12, left: 0},
};
const open = (scope: string, status = 'SCHEDULED') => ({requestId: 'r1', scope, status, dueAt: DUE});
const identity = (over: Record<string, unknown> = {}) => ({
  id: 'u1',
  roles: ['CUSTOMER'],
  pendingDeletion: open('ALL'),
  ...over,
});

let tree: renderer.ReactTestRenderer;
let deletion: ReturnType<typeof useAccountDeletion>;
let insetsTop: number;
let childMounts: number;
let stripVisible: boolean;

function Child() {
  deletion = useAccountDeletion();
  insetsTop = useSafeAreaInsets().top;
  stripVisible = useDeletionStripVisible();
  React.useEffect(() => {
    childMounts += 1;
  }, []);
  return <Text>screen</Text>;
}
const app = () => (
  <SafeAreaProvider initialMetrics={metrics}>
    <AccountDeletionProvider>
      <Child />
    </AccountDeletionProvider>
  </SafeAreaProvider>
);
const mount = () =>
  act(() => {
    tree = renderer.create(app());
  });
const rerender = () => act(() => tree.update(app()));
const lines = () => tree.root.findAllByType(Text).map(t => [t.props.children].flat().join(''));
const pill = (): ReactTestInstance | undefined =>
  tree.root.findAll(n => n.props.accessibilityLabel === 'Keep my account' && typeof n.props.onPress === 'function')[0];
const keep = jest.mocked(accountDeletionApi.keep);
const refresh = jest.mocked(sessionManager.refresh);

async function pressKeep() {
  let outcome: string | undefined;
  await act(async () => {
    outcome = await deletion.keep();
  });
  return outcome;
}

describe('AccountDeletionProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    childMounts = 0;
    mockKeepItPending = false;
    mockIdentity = identity();
    refresh.mockResolvedValue(null);
  });
  afterEach(() => {
    act(() => tree.unmount());
    jest.useRealTimers();
  });

  it('shows the date of a scheduled whole-account request', () => {
    mount();
    expect(lines()).toContain('Account deleted on 5 Dec');
    expect(deletion.pending).toMatchObject({scope: 'ALL', status: 'SCHEDULED'});
  });

  it('shows no strip without an open request, or from a server that sends none', () => {
    mockIdentity = identity({pendingDeletion: null});
    mount();
    expect(lines()).toEqual(['screen']);
    expect(tree.root.findAllByType(StatusBar)).toHaveLength(0);
    mockIdentity = identity({pendingDeletion: undefined});
    rerender();
    expect(lines()).toEqual(['screen']);
    expect(deletion.pending).toBeNull();
  });

  it('shows no Keep button once deleting has started', () => {
    mockIdentity = identity({pendingDeletion: open('CHEF', 'ERASING')});
    mount();
    expect(lines()).toContain('Chef side being deleted');
    expect(pill()).toBeUndefined();
  });

  it('keeps the screens clear of the status bar twice: no top inset below the strip, today\'s inset without it', () => {
    mount();
    expect(insetsTop).toBe(0);
    act(() => tree.unmount());
    mockIdentity = identity({pendingDeletion: null});
    mount();
    expect(insetsTop).toBe(24);
  });

  it('uses dark status bar icons while the strip shows', () => {
    mount();
    expect(tree.root.findByType(StatusBar).props.barStyle).toBe('dark-content');
  });

  it('tells the screens whether the strip is showing, so they can keep their status bar icons dark', async () => {
    mockIdentity = identity({pendingDeletion: null});
    mount();
    expect(stripVisible).toBe(false);
    mockIdentity = identity();
    rerender();
    expect(stripVisible).toBe(true);
    // a notice keeps the strip up after the request is gone
    mockIdentity = identity();
    keep.mockResolvedValue({} as never);
    await pressKeep();
    mockIdentity = identity({pendingDeletion: null});
    rerender();
    expect(stripVisible).toBe(true);
    act(() => jest.advanceTimersByTime(4000));
    expect(stripVisible).toBe(false);
  });

  it('shows no strip, and lets the screen set its own status bar, while Keep it? asks', () => {
    mockKeepItPending = true;
    mount();
    expect(lines()).toEqual(['screen']);
    expect(tree.root.findAllByType(StatusBar)).toHaveLength(0);
    expect(stripVisible).toBe(false);
    expect(insetsTop).toBe(24);
    expect(deletion.pending).toMatchObject({scope: 'ALL', status: 'SCHEDULED'});
    mockKeepItPending = false;
    rerender();
    expect(lines()).toContain('Account deleted on 5 Dec');
    expect(stripVisible).toBe(true);
    expect(childMounts).toBe(1);
  });

  it('does not rebuild the screens when the strip comes and goes', () => {
    mockIdentity = identity({pendingDeletion: null});
    mount();
    mockIdentity = identity();
    rerender();
    expect(lines()).toContain('Account deleted on 5 Dec');
    mockIdentity = identity({pendingDeletion: null});
    rerender();
    expect(childMounts).toBe(1);
  });

  it('sends one request on a double tap, then refreshes the session, and shows the kept notice', async () => {
    let finish!: () => void;
    keep.mockReturnValue(
      new Promise(resolve => {
        finish = () => resolve({} as never);
      }),
    );
    mount();
    act(() => {
      pill()!.props.onPress();
      pill()!.props.onPress();
    });
    expect(deletion.keeping).toBe(true);
    expect(pill()!.props.disabled).toBe(true);
    await act(async () => finish());
    expect(keep).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(keep.mock.invocationCallOrder[0]).toBeLessThan(refresh.mock.invocationCallOrder[0]);
    expect(deletion.keeping).toBe(false);
    expect(deletion.notice).toBe('Your account is kept. Meal plans that ended when you asked stay ended.');
    expect(lines()).toContain(deletion.notice);
    expect(pill()).toBeUndefined();
  });

  it('says the kitchen reopens when the chef side was cancelled, and drops the notice after 4 seconds', async () => {
    keep.mockResolvedValue({} as never);
    mockIdentity = identity({roles: ['CUSTOMER', 'CHEF'], pendingDeletion: open('CHEF')});
    mount();
    expect(await pressKeep()).toBe('kept');
    expect(deletion.notice).toBe('Your account is kept. Your kitchen reopens as it was within a minute.');
    act(() => jest.advanceTimersByTime(3999));
    expect(deletion.notice).not.toBeNull();
    act(() => jest.advanceTimersByTime(1));
    expect(deletion.notice).toBeNull();
  });

  it('says Deletion has already started on 409, and refreshes so the Keep button goes', async () => {
    keep.mockRejectedValue(new AppApiError('ACCOUNT_DELETION_IN_PROGRESS', 'x', 409));
    mount();
    expect(await pressKeep()).toBe('inProgress');
    expect(lines()).toContain("Deletion has already started and can't be stopped.");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('refreshes quietly and counts as kept when the request had already ended (404)', async () => {
    keep.mockRejectedValue(new AppApiError('NO_DELETION_REQUEST', 'x', 404));
    mount();
    expect(await pressKeep()).toBe('kept');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(deletion.notice).toBeNull();
  });

  it('says it could not keep the account on any other failure, leaves the Keep button, and does not refresh', async () => {
    keep.mockRejectedValue(new AppApiError('NETWORK_ERROR', 'x'));
    mount();
    expect(await pressKeep()).toBe('failed');
    expect(lines()).toContain("Couldn't keep your account. Try again.");
    expect(pill()).toBeDefined();
    expect(refresh).not.toHaveBeenCalled();
    expect(deletion.keeping).toBe(false);
  });

  it('can be used again after a failure', async () => {
    keep.mockRejectedValueOnce(new AppApiError('NETWORK_ERROR', 'x')).mockResolvedValueOnce({} as never);
    mount();
    expect(await pressKeep()).toBe('failed');
    expect(await pressKeep()).toBe('kept');
    expect(keep).toHaveBeenCalledTimes(2);
  });

  it('reads as no strip outside the provider', () => {
    function Probe() {
      stripVisible = useDeletionStripVisible();
      return null;
    }
    stripVisible = true;
    let probe!: renderer.ReactTestRenderer;
    act(() => {
      probe = renderer.create(<Probe />);
    });
    expect(stripVisible).toBe(false);
    act(() => probe.unmount());
  });

  it('can only be used inside the provider', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() =>
      act(() => {
        renderer.create(<Child />);
      }),
    ).toThrow(/AccountDeletionProvider/);
    spy.mockRestore();
  });
});
