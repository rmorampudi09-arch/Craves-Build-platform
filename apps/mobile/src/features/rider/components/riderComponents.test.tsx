import React from 'react';
import {AccessibilityInfo, Animated, StyleSheet, Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {Badge, Icon} from '../../../shared/components';
import {colors, radius} from '../../../design/tokens';
import type {HomeSummary, Trip} from '../api/contract';
import {riderKeys} from '../state/riderQueries';
import {Banner} from './Banner';
import {BottomAction} from './BottomAction';
import {CountdownBar} from './CountdownBar';
import {RiderHeader} from './RiderHeader';
import {STATUS_TONE, StatusBadge} from './StatusBadge';
import {StepBar} from './StepBar';
import {Card, HeroCard, RateRow} from './ui';

const mockNavigation = {navigate: jest.fn(), goBack: jest.fn()};

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));
jest.mock('../api/riderApi', () => ({
  riderApi: new Proxy({}, {get: () => jest.fn(() => new Promise(() => undefined))}),
}));

const offline: HomeSummary = {online: false, todayEarningsPaise: 0, todayTrips: 0};
let tree: renderer.ReactTestRenderer;

async function render(node: React.ReactElement, seed: Array<[readonly unknown[], unknown]> = []) {
  const client = new QueryClient({defaultOptions: {queries: {retry: false, staleTime: Infinity}}});
  seed.forEach(([key, data]) => client.setQueryData(key, data));
  await act(async () => {
    tree = renderer.create(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
  });
}

// The rendered (host) view, which carries the final style and accessibility props.
const byId = (testID: string) => tree.root.find(node => node.props.testID === testID && typeof node.type === 'string');
const has = (testID: string) => tree.root.findAll(node => node.props.testID === testID).length > 0;
const style = (testID: string) => StyleSheet.flatten(byId(testID).props.style);
// The Pressable itself, whose onPress runs the component's own guard.
const pressable = (testID: string) =>
  tree.root.find(node => node.props.testID === testID && node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function');
const texts = () => tree.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));

beforeEach(() => jest.clearAllMocks());
afterEach(() => {
  act(() => tree?.unmount());
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('RiderHeader', () => {
  const chip = () => byId('rider-status-chip');

  it('says Offline in a neutral chip, with the title and SOS', async () => {
    await render(<RiderHeader title="Hi, Ravi" />, [[riderKeys.home, offline], [riderKeys.activeTrip, null]]);
    expect(chip().props.accessibilityLabel).toBe('Offline');
    expect(StyleSheet.flatten(chip().props.style).backgroundColor).toBe(colors.white);
    expect(texts()).toContain('Hi, Ravi');
    act(() => pressable('rider-sos').props.onPress());
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Sos', {tripId: undefined});
    expect(byId('rider-sos').props.accessibilityLabel).toBe('SOS, emergency help');
  });

  it('turns green while waiting for orders', async () => {
    await render(<RiderHeader title="Hi, Ravi" />, [[riderKeys.home, {...offline, online: true}], [riderKeys.activeTrip, null]]);
    expect(chip().props.accessibilityLabel).toBe('Online · waiting for orders');
    expect(StyleSheet.flatten(chip().props.style)).toMatchObject({backgroundColor: colors.successSoft, borderColor: colors.success});
  });

  it('shows the trip step and passes the trip to SOS', async () => {
    await render(<RiderHeader title="At the kitchen" tripId="t1" />, [
      [riderKeys.home, {...offline, online: true}],
      [riderKeys.activeTrip, {step: 'AT_KITCHEN'} as Trip],
    ]);
    expect(chip().props.accessibilityLabel).toBe('Trip · step 2 of 4');
    act(() => pressable('rider-sos').props.onPress());
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Sos', {tripId: 't1'});
  });

  it('says Not active yet for an account that cannot work', async () => {
    await render(<RiderHeader title="Your sign-up" inactive />, [[riderKeys.home, {...offline, online: true}], [riderKeys.activeTrip, null]]);
    expect(chip().props.accessibilityLabel).toBe('Not active yet');
    expect(StyleSheet.flatten(chip().props.style).backgroundColor).toBe(colors.white);
  });

  it('has a back variant with a title and SOS but no chip', async () => {
    await render(<RiderHeader title="Trip pay" back />, [[riderKeys.home, offline], [riderKeys.activeTrip, null]]);
    expect(has('rider-status-chip')).toBe(false);
    expect(has('rider-sos')).toBe(true);
    expect(byId('rider-back').props.accessibilityLabel).toBe('Back');
    act(() => pressable('rider-back').props.onPress());
    expect(mockNavigation.goBack).toHaveBeenCalled();
    expect(style('rider-header').minHeight).toBe(64);
  });

  it('shows only the chip when there is no title', async () => {
    await render(<RiderHeader />, [[riderKeys.home, offline], [riderKeys.activeTrip, null]]);
    expect(has('rider-status-chip')).toBe(true);
    expect(tree.root.findAll(node => node.props.accessibilityRole === 'header')).toHaveLength(0);
  });
});

describe('StepBar', () => {
  it('darkens the done and current steps and reads as one element', async () => {
    await render(<StepBar step={2} />);
    const fills = [1, 2, 3, 4].map(n => style(`rider-step-${n}`).backgroundColor);
    expect(fills).toEqual([colors.textPrimary, colors.textPrimary, colors.border, colors.border]);
    expect(byId('rider-step-bar').props.accessibilityLabel).toBe('Trip step 2 of 4');
  });
});

describe('CountdownBar', () => {
  const fill = () => byId('bar').findAll(node => typeof node.type === 'string' && node !== byId('bar'))[0];
  const scale = () => StyleSheet.flatten(fill().props.style).transform?.[0]?.scaleX;

  it('runs one native-driver animation for no longer than the time left', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const timing = jest.spyOn(Animated, 'timing');
    await render(<CountdownBar deadlineMs={Date.now() + 28_000} totalMs={40_000} testID="bar" />);
    const config = timing.mock.calls.at(-1)?.[1];
    expect(config).toMatchObject({toValue: 0, useNativeDriver: true});
    expect(config?.duration).toBeGreaterThan(27_000);
    expect(config?.duration).toBeLessThanOrEqual(28_000);
    expect(style('bar').height).toBe(8);
  });

  it('never runs longer than the whole offer, even with a late deadline', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const timing = jest.spyOn(Animated, 'timing');
    await render(<CountdownBar deadlineMs={Date.now() + 90_000} totalMs={40_000} testID="bar" />);
    expect(timing.mock.calls.at(-1)?.[1].duration).toBe(40_000);
  });

  it('steps once a second with reduce motion on, instead of animating', async () => {
    jest.useFakeTimers({now: 1_000_000});
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const timing = jest.spyOn(Animated, 'timing');
    await render(<CountdownBar deadlineMs={1_000_000 + 20_000} totalMs={40_000} testID="bar" />);
    expect(timing).not.toHaveBeenCalled();
    expect(scale()).toBeCloseTo(0.5);
    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    expect(scale()).toBeCloseTo(0.25);
  });

  it('fills up with the time passed in the wait style', async () => {
    jest.useFakeTimers({now: 1_000_000});
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    await render(<CountdownBar deadlineMs={1_000_000 + 360_000} totalMs={480_000} variant="wait" testID="bar" />);
    expect(scale()).toBeCloseTo(0.25);
    expect(style('bar').height).toBe(6);
  });
});

describe('Banner', () => {
  it.each([
    ['warning', colors.warningSoft, colors.warningText],
    ['success', colors.successSoft, colors.successText],
    ['info', colors.muted, colors.textPrimary],
  ] as const)('%s has its fill, text colour and an icon', async (tone, fill, text) => {
    await render(<Banner tone={tone} text="Heavy rain expected after 8 pm." testID="banner" />);
    expect(style('banner').backgroundColor).toBe(fill);
    expect(StyleSheet.flatten(tree.root.findByType(Text).props.style).color).toBe(text);
    expect(tree.root.findAllByType(Icon)).toHaveLength(1);
  });

  it('can drop the icon and carry bold first and closing lines', async () => {
    await render(<Banner tone="warning" icon={null} title="Why it's on hold" text="Ops checks the photo." closing="Decision by Mon 26 Oct." />);
    expect(tree.root.findAllByType(Icon)).toHaveLength(0);
    expect(texts()).toEqual(["Why it's on hold", 'Ops checks the photo.', 'Decision by Mon 26 Oct.']);
  });
});

describe('StatusBadge', () => {
  it('maps every status to the design tone', () => {
    expect(STATUS_TONE).toMatchObject({
      VERIFIED: 'success',
      CREDITED: 'success',
      PAID: 'success',
      PENDING: 'info',
      PROCESSING: 'info',
      HELD: 'warning',
      SOON: 'warning',
      REJECTED: 'error',
    });
  });

  it('renders the tone with a 24 dp or compact 20 dp pill', async () => {
    await render(<StatusBadge status="REJECTED" label="Not accepted" />);
    expect(tree.root.findByType(Badge).props).toMatchObject({label: 'Not accepted', tone: 'error'});
    expect(StyleSheet.flatten(tree.root.findByType(Badge).props.style).minHeight).toBe(24);
    await render(<StatusBadge status="HELD" label="On hold" compact />);
    expect(StyleSheet.flatten(tree.root.findByType(Badge).props.style).minHeight).toBe(20);
  });
});

describe('BottomAction', () => {
  it('is 56 dp with no shadow, and 64 dp when tall', async () => {
    await render(<BottomAction label="Go online" onPress={jest.fn()} testID="go" />);
    expect(style('go')).toMatchObject({minHeight: 56, borderRadius: radius.md, backgroundColor: colors.flameRedAccessible});
    expect(style('go').elevation).toBeUndefined();
    await render(<BottomAction label="Accept" size="tall" onPress={jest.fn()} testID="go" />);
    expect(style('go').minHeight).toBe(64);
  });

  it('draws the outline with a grey line and a dark label', async () => {
    await render(<BottomAction label="Go offline" variant="outline" onPress={jest.fn()} testID="go" />);
    expect(style('go')).toMatchObject({borderColor: colors.borderStrong, backgroundColor: colors.white});
    expect(StyleSheet.flatten(tree.root.findByType(Text).props.style).color).toBe(colors.textPrimary);
  });

  it('looks locked and ignores taps when disabled', async () => {
    const onPress = jest.fn();
    await render(<BottomAction label="Delivered" disabled onPress={onPress} testID="go" />);
    expect(pressable('go').props.disabled).toBe(true);
    expect(style('go').backgroundColor).toBe(colors.muted);
  });

  it('sends once while its action is still running', async () => {
    let finish: () => void = () => undefined;
    const onPress = jest.fn(() => new Promise<void>(resolve => (finish = resolve)));
    await render(<BottomAction label="Picked up" onPress={onPress} testID="go" />);
    await act(async () => {
      pressable('go').props.onPress();
    });
    expect(pressable('go').props.disabled).toBe(true);
    await act(async () => {
      pressable('go').props.onPress();
      finish();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(pressable('go').props.disabled).toBe(false);
  });
});

describe('cards and rows', () => {
  it('keeps cards flat: radius 14 with a 1 dp line; the hero card is radius 20 with a dark line', async () => {
    await render(
      <>
        <Card style={{}}>
          <Text>a</Text>
        </Card>
        <HeroCard>
          <Text>b</Text>
        </HeroCard>
      </>,
    );
    const [card, hero] = tree.root.findAll(node => typeof node.type === 'string' && node.props.style).map(n => StyleSheet.flatten(n.props.style));
    expect(card).toMatchObject({borderRadius: 14, borderWidth: 1, borderColor: colors.border, elevation: 0});
    expect(hero).toMatchObject({borderRadius: 20, borderColor: colors.textPrimary});
  });

  it('puts the label left and the bold value right', async () => {
    await render(<RateRow label="Base pay, first 2 km" value="₹40" total />);
    const [label, value] = tree.root.findAllByType(Text).map(n => StyleSheet.flatten(n.props.style));
    expect(label).toMatchObject({flex: 1, color: colors.textPrimary, fontWeight: '700'});
    expect(value).toMatchObject({textAlign: 'right', fontWeight: '700'});
  });
});
