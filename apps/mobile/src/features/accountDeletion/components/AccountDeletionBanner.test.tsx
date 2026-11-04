import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import renderer, {act, type ReactTestInstance} from 'react-test-renderer';
import {colors} from '../../../design/tokens';
import {AccountDeletionBanner, type StripNotice} from './AccountDeletionBanner';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 30, right: 0, bottom: 0, left: 0}),
}));

const scheduled = {text: 'Account deleted on 5 Dec', canKeep: true};
const erasing = {text: 'Account being deleted', canKeep: false};
const kept: StripNotice = {text: 'Your account is kept.', tone: 'success'};
const failed: StripNotice = {text: "Couldn't keep your account. Try again.", tone: 'warning'};

let tree: renderer.ReactTestRenderer;
const onKeep = jest.fn();

function mount(props: Partial<React.ComponentProps<typeof AccountDeletionBanner>>) {
  act(() => {
    tree = renderer.create(
      <AccountDeletionBanner banner={null} notice={null} keeping={false} onKeep={onKeep} {...props} />,
    );
  });
}
const keepPill = (): ReactTestInstance | undefined =>
  tree.root.findAll(n => n.props.accessibilityLabel === 'Keep my account' && typeof n.props.onPress === 'function')[0];
const strip = () => StyleSheet.flatten(tree.root.findAllByType(View)[0].props.style);
const lines = () => tree.root.findAllByType(Text).map(t => [t.props.children].flat().join(''));

describe('AccountDeletionBanner', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => act(() => tree.unmount()));

  it('shows nothing without a request or a notice', () => {
    mount({});
    expect(tree.toJSON()).toBeNull();
  });

  it('shows the text as an alert, in amber, below the status bar', () => {
    mount({banner: scheduled});
    expect(lines()).toContain('Account deleted on 5 Dec');
    expect(tree.root.findAllByType(Text)[0].props.accessibilityRole).toBe('alert');
    // The strip stays up, so a notice that replaces its text is read out politely (TalkBack needs this).
    expect(tree.root.findAllByType(Text)[0].props.accessibilityLiveRegion).toBe('polite');
    expect(strip().backgroundColor).toBe(colors.warningSoft);
    expect(strip().paddingTop).toBeGreaterThanOrEqual(30);
  });

  it('has a Keep my account pill that asks to keep', () => {
    mount({banner: scheduled});
    expect(keepPill()!.props.disabled).toBeFalsy();
    act(() => keepPill()!.props.onPress());
    expect(onKeep).toHaveBeenCalledTimes(1);
  });

  it('disables the pill while keeping', () => {
    mount({banner: scheduled, keeping: true});
    expect(keepPill()!.props.disabled).toBe(true);
  });

  it('has no pill once deleting has started', () => {
    mount({banner: erasing});
    expect(lines()).toContain('Account being deleted');
    expect(keepPill()).toBeUndefined();
  });

  it('shows a kept notice in green with no pill, even before the identity catches up', () => {
    mount({banner: scheduled, notice: kept});
    expect(lines()).toContain('Your account is kept.');
    expect(lines()).not.toContain('Account deleted on 5 Dec');
    expect(strip().backgroundColor).toBe(colors.successSoft);
    expect(keepPill()).toBeUndefined();
  });

  it('shows a notice on its own after the request is gone', () => {
    mount({notice: kept});
    expect(lines()).toContain('Your account is kept.');
  });

  it('shows a failure notice in amber and keeps the pill for another try', () => {
    mount({banner: scheduled, notice: failed});
    expect(lines()).toContain("Couldn't keep your account. Try again.");
    expect(strip().backgroundColor).toBe(colors.warningSoft);
    expect(keepPill()).toBeDefined();
  });
});
