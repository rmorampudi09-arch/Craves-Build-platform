import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import renderer, {act, type ReactTestInstance} from 'react-test-renderer';
import {colors} from '../../../design/tokens';
import {pausedOrderText} from '../domain/deletionModel';
import type {PendingDeletion} from '../domain/deletionTypes';
import {useAccountDeletion} from '../state/AccountDeletionProvider';
import {DeletionPausedNotice} from './DeletionPausedNotice';

jest.mock('../state/AccountDeletionProvider', () => ({useAccountDeletion: jest.fn()}));

const scheduled: PendingDeletion = {
  requestId: 'r1',
  scope: 'ALL',
  status: 'SCHEDULED',
  dueAt: '2026-12-05T12:00:00Z',
};
const keep = jest.fn();
let tree: renderer.ReactTestRenderer;

function mockHook(pending: PendingDeletion | null, keeping = false) {
  jest.mocked(useAccountDeletion).mockReturnValue({pending, keep, keeping, notice: null});
}
function mount(kind: 'orders' | 'mealPlans' = 'orders', onKept?: () => void) {
  act(() => {
    tree = renderer.create(<DeletionPausedNotice kind={kind} onKept={onKept} />);
  });
}
const rerender = (kind: 'orders' | 'mealPlans' = 'orders') => act(() => tree.update(<DeletionPausedNotice kind={kind} />));
const pill = (): ReactTestInstance | undefined =>
  tree.root.findAll(n => n.props.accessibilityLabel === 'Keep my account' && typeof n.props.onPress === 'function')[0];
const lines = () => tree.root.findAllByType(Text).map(t => [t.props.children].flat().join(''));

describe('DeletionPausedNotice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    keep.mockResolvedValue('kept');
    mockHook(scheduled);
  });
  afterEach(() => act(() => tree.unmount()));

  it('says new orders are paused, in a red box, as an alert', () => {
    mount('orders');
    expect(lines()).toContain(pausedOrderText(scheduled, 'orders'));
    const box = tree.root.findAllByType(View)[0];
    expect(box.props.accessibilityRole).toBe('alert');
    expect(StyleSheet.flatten(box.props.style).backgroundColor).toBe(colors.errorSoft);
  });

  it('says new meal plans are paused for the meal plan kind, without a date when the request has none', () => {
    mockHook({...scheduled, status: 'PENDING_REVIEW', dueAt: null});
    mount('mealPlans');
    expect(lines()).toContain('Your account is set to be deleted, so new meal plans are paused.');
  });

  it('keeps the account from the pill and hides once it is kept', async () => {
    mount();
    await act(async () => {
      pill()!.props.onPress();
    });
    expect(keep).toHaveBeenCalledTimes(1);
    expect(tree.toJSON()).toBeNull();
  });

  it.each([
    ['kept', 1],
    ['failed', 0],
    ['inProgress', 0],
  ] as const)('tells the screen only when keeping ends kept (%s)', async (outcome, calls) => {
    keep.mockResolvedValue(outcome);
    const onKept = jest.fn();
    mount('orders', onKept);
    await act(async () => {
      pill()!.props.onPress();
    });
    expect(onKept).toHaveBeenCalledTimes(calls);
  });

  it.each(['failed', 'inProgress'] as const)('stays up when keeping ends %s', async outcome => {
    keep.mockResolvedValue(outcome);
    mount();
    await act(async () => {
      pill()!.props.onPress();
    });
    expect(tree.toJSON()).not.toBeNull();
  });

  it('disables the pill while keeping', () => {
    mockHook(scheduled, true);
    mount();
    expect(pill()!.props.disabled).toBe(true);
  });

  it('hides when the request goes away elsewhere, such as the strip Keep button', () => {
    mount();
    mockHook(null);
    rerender();
    expect(tree.toJSON()).toBeNull();
  });

  it('still explains a refusal the identity does not know about yet', () => {
    mockHook(null);
    mount();
    expect(lines()).toContain('Your account is set to be deleted, so new orders are paused.');
    expect(pill()).toBeDefined();
  });

  it('offers no Keep once deleting has started', () => {
    mockHook({...scheduled, status: 'ERASING'});
    mount();
    expect(pill()).toBeUndefined();
  });
});
