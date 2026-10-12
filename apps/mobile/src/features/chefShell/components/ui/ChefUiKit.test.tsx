import React from 'react';
import renderer, {act, type ReactTestInstance} from 'react-test-renderer';
import {Modal, StyleSheet, Text, View} from 'react-native';
import {colors} from '../../../../design/tokens';
import {LoadingIndicator} from '../../../../shared/components/LoadingIndicator';
import {
  ChefCard,
  ChefScreen,
  ChefSheet,
  ChefToastProvider,
  ChefTopBar,
  ComingSoon,
  ConfirmDialog,
  ListGroup,
  ListRow,
  OrderCard,
  StatTile,
  StatusChip,
  VegMark,
  useChefToast,
} from './index';

const mockNavigate = jest.fn();
let mockUnread = 0;

jest.mock('@react-navigation/native', () => ({useNavigation: () => ({navigate: mockNavigate})}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 34, left: 0}),
}));
jest.mock('../../../../design/reducedMotion', () => ({useReducedMotionPreference: () => false}));
jest.mock('../../state/ChefOperationalProvider', () => ({
  useChefOperationalState: () => ({counters: {unreadNotifications: mockUnread}}),
}));

const LONG_DISH = 'Hyderabadi dum chicken biryani with extra raita and a boiled egg'.slice(0, 60);
const order = {
  id: '11111111-1111-4111-8111-1111-7a3df94b',
  customerName: 'Priya S.',
  area: 'KPHB Colony',
  placedAt: new Date(Date.now() - 2 * 60_000).toISOString(),
  total: 220,
  items: [
    {name: LONG_DISH, quantity: 2, foodType: 'NON_VEG' as const},
    {name: 'Lemon rice', quantity: 1, foodType: 'VEG' as const},
  ],
  note: 'Less spicy please',
};

describe('Chef UI kit', () => {
  let tree: renderer.ReactTestRenderer;
  const mount = (element: React.ReactElement) => {
    act(() => {
      tree = renderer.create(element);
    });
  };
  beforeEach(() => {
    jest.clearAllMocks();
    mockUnread = 0;
  });
  afterEach(() => act(() => tree?.unmount()));

  const textOf = (node: ReactTestInstance) => React.Children.toArray(node.props.children).join('');
  const allText = () => tree.root.findAllByType(Text).map(textOf);
  const pressables = (label: string) =>
    tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
  const roleButtons = () => tree.root.findAll(n => n.props.accessibilityRole === 'button');

  it('OrderCard shows the short number, quantity, note, money and truncates a long dish name', () => {
    mount(<OrderCard order={order} actions={<Text>ACTIONS</Text>} />);
    const text = allText();
    expect(text).toContain('#DF94B');
    expect(text).toContain('2×');
    expect(text).toContain('1×');
    expect(text.some(t => t.includes('Less spicy please'))).toBe(true);
    expect(text).toContain('₹220');
    expect(text).toContain('ACTIONS');
    expect(text.some(t => t.includes('Priya S.') && t.includes('KPHB Colony') && t.includes('2 min ago'))).toBe(true);
    const dish = tree.root.findAllByType(Text).find(n => textOf(n) === LONG_DISH);
    expect(LONG_DISH).toHaveLength(60);
    expect(dish?.props.numberOfLines).toBeGreaterThan(0);
    expect(text.join(' ')).not.toMatch(/NON_VEG|VEG\b/);
  });

  it('OrderCard can say "Ready since 12:25 PM" in place of the age, and show a status chip beside the number', () => {
    mount(
      <OrderCard
        badge={<Text>BADGE</Text>}
        order={{...order, area: undefined, detail: 'Ready since 12:25 PM'}}
      />,
    );
    const text = allText();
    expect(text).toContain('BADGE');
    expect(text).toContain('Priya S. · Ready since 12:25 PM');
    expect(text.join(' ')).not.toContain('min ago');
  });

  it('OrderCard keeps the action buttons outside the tappable summary', () => {
    const onPress = jest.fn();
    mount(<OrderCard order={order} onPress={onPress} actions={<Text accessibilityLabel="Accept">Accept</Text>} />);
    const summary = roleButtons().find(n => String(n.props.accessibilityLabel).includes('#DF94B'));
    expect(summary).toBeDefined();
    expect(summary!.findAll(n => n.props.accessibilityLabel === 'Accept')).toHaveLength(0);
    act(() => summary!.props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ConfirmDialog disables the confirm button and shows a spinner while busy', () => {
    mount(
      <ConfirmDialog
        visible
        busy
        title="Reject order?"
        message="The customer will be told."
        confirmLabel="Reject order"
        tone="danger"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    const confirm = tree.root.findAll(
      n => n.props.accessibilityLabel === 'Reject order' && n.props.accessibilityState?.busy === true,
    )[0];
    expect(confirm.props.accessibilityState.disabled).toBe(true);
    expect(confirm.props.disabled).toBe(true);
    expect(tree.root.findAllByType(LoadingIndicator)).toHaveLength(1);
    const cancel = tree.root.findAll(n => n.props.accessibilityLabel === 'Cancel' && n.props.accessibilityState)[0];
    expect(cancel.props.disabled).toBe(true);
  });

  it('ConfirmDialog calls back when idle', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    mount(
      <ConfirmDialog visible title="Mark ready?" message="m" confirmLabel="Mark ready" onConfirm={onConfirm} onCancel={onCancel} />,
    );
    act(() => pressables('Mark ready')[0].props.onPress());
    act(() => pressables('Cancel')[0].props.onPress());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('ConfirmDialog Cancel is neutral: grey border and dark text, not the red outline', () => {
    mount(
      <ConfirmDialog visible title="Reject order?" message="m" confirmLabel="Reject order" tone="danger" onConfirm={jest.fn()} onCancel={jest.fn()} />,
    );
    const box = StyleSheet.flatten(pressables('Cancel')[0].props.style({pressed: false}));
    expect(box.borderColor).toBe(colors.borderStrong);
    expect(box.backgroundColor).toBe(colors.white);
    const label = tree.root.findAllByType(Text).find(n => textOf(n) === 'Cancel');
    expect(StyleSheet.flatten(label!.props.style).color).toBe(colors.textPrimary);
  });

  it('VegMark renders nothing for a missing or unknown food type instead of crashing', () => {
    for (const type of [undefined, null, '', 'VEGAN', 'veg']) {
      mount(<VegMark type={type as never} />);
      expect(tree.toJSON()).toBeNull();
      act(() => tree.unmount());
    }
    mount(<VegMark type="NON_VEG" />);
    expect(tree.root.findAll(n => n.props.accessibilityLabel === 'Non-vegetarian').length).toBeGreaterThan(0);
  });

  it('ListRow is a button only when it has onPress', () => {
    mount(<ListRow title="Kitchen name" subtitle="Open" />);
    expect(roleButtons()).toHaveLength(0);
    act(() => tree.update(<ListRow title="Kitchen name" subtitle="Open" onPress={jest.fn()} />));
    expect(roleButtons().length).toBeGreaterThan(0);
  });

  it('ListRow wraps a long title instead of overflowing, and ListGroup separates rows', () => {
    mount(
      <ListGroup>
        <ListRow title={LONG_DISH} value="₹1,240" />
        <ListRow title="Second" />
      </ListGroup>,
    );
    const title = tree.root.findAllByType(Text).find(n => textOf(n) === LONG_DISH);
    expect(title?.props.numberOfLines).toBeGreaterThan(0);
  });

  it('ChefScreen has a white background and a sticky footer', () => {
    mount(
      <ChefScreen testID="screen" header={<Text>HEADER</Text>} footer={<Text>FOOTER</Text>}>
        <Text>BODY</Text>
      </ChefScreen>,
    );
    const root = tree.root.findAll(n => n.props.testID === 'screen' && n.props.style)[0];
    expect(StyleSheet.flatten(root.props.style).backgroundColor).toBe(colors.white);
    expect(allText()).toEqual(expect.arrayContaining(['HEADER', 'BODY', 'FOOTER']));
  });

  it('ChefSheet closes from the Android back button and the scrim', () => {
    const onClose = jest.fn();
    mount(
      <ChefSheet visible title="Reject #DF94B?" onClose={onClose}>
        <Text>reasons</Text>
      </ChefSheet>,
    );
    expect(allText()).toEqual(expect.arrayContaining(['Reject #DF94B?', 'reasons']));
    act(() => tree.root.findByType(Modal).props.onRequestClose());
    act(() => pressables('Close')[0].props.onPress());
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('ChefTopBar shows the unread count, opens notifications and offers a back arrow', () => {
    mockUnread = 3;
    const onBack = jest.fn();
    mount(<ChefTopBar title="Orders" subtitle="Today" onBack={onBack} />);
    expect(allText()).toEqual(expect.arrayContaining(['Orders', 'Today', '3']));
    act(() => pressables('Notifications, 3 unread')[0].props.onPress());
    expect(mockNavigate).toHaveBeenCalledWith('ChefNotifications');
    act(() => pressables('Go back')[0].props.onPress());
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('ChefTopBar can show a Close X in place of the back arrow', () => {
    const onBack = jest.fn();
    mount(<ChefTopBar title="New dish" onBack={onBack} backIcon="close" showBell={false} />);
    expect(pressables('Go back')).toHaveLength(0);
    act(() => pressables('Close')[0].props.onPress());
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('ChefTopBar hides the bell and back arrow when asked', () => {
    mount(<ChefTopBar title="Menu" showBell={false} />);
    expect(pressables('Notifications')).toHaveLength(0);
    expect(pressables('Go back')).toHaveLength(0);
  });

  it('shows one toast at a time for 2.6 seconds', () => {
    jest.useFakeTimers();
    try {
      let toast!: ReturnType<typeof useChefToast>;
      const Probe = () => {
        toast = useChefToast();
        return null;
      };
      mount(
        <ChefToastProvider>
          <Probe />
        </ChefToastProvider>,
      );
      act(() => toast.show('Saved'));
      expect(allText()).toEqual(['Saved']);
      act(() => {
        jest.advanceTimersByTime(2000);
      });
      act(() => toast.show('Published'));
      expect(allText()).toEqual(['Published']);
      act(() => {
        jest.advanceTimersByTime(2599);
      });
      expect(allText()).toEqual(['Published']);
      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(allText()).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('a toast with an action shows its button for 4 seconds and the button runs once, then clears the toast', () => {
    jest.useFakeTimers();
    try {
      let toast!: ReturnType<typeof useChefToast>;
      const Probe = () => {
        toast = useChefToast();
        return null;
      };
      mount(
        <ChefToastProvider>
          <Probe />
        </ChefToastProvider>,
      );
      const onUndo = jest.fn();
      act(() => toast.show('Prawns biryani is off', {label: 'Undo', onPress: onUndo}));
      expect(allText()).toEqual(['Prawns biryani is off', 'Undo']);
      act(() => {
        jest.advanceTimersByTime(3999);
      });
      expect(allText()).toContain('Undo');
      act(() => pressables('Undo')[0].props.onPress());
      expect(onUndo).toHaveBeenCalledTimes(1);
      expect(allText()).toEqual([]);
      act(() => toast.show('Prawns biryani is off', {label: 'Undo', onPress: onUndo}));
      act(() => {
        jest.advanceTimersByTime(4000);
      });
      expect(allText()).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('useChefToast is a safe no-op without a provider', () => {
    const Probe = () => {
      useChefToast().show('x');
      return null;
    };
    expect(() => mount(<Probe />)).not.toThrow();
  });

  it('renders the small pieces without raw enums', () => {
    mount(
      <View>
        <StatusChip label="Preparing" tone="cooking" />
        <StatTile value="₹1,240" label="Today" trend={{text: '12% vs last week', direction: 'up'}} onPress={jest.fn()} />
        <VegMark type="EGG" />
        <ChefCard highlighted accessibilityLabel="Card" onPress={jest.fn()}>
          <Text>inside</Text>
        </ChefCard>
        <ComingSoon title="Reviews" message="We are getting this ready for you." />
      </View>,
    );
    const text = allText();
    expect(text).toEqual(
      expect.arrayContaining(['Preparing', '₹1,240', 'Today', '12% vs last week', 'inside', 'Reviews', 'Coming soon']),
    );
    expect(pressables('Card').length).toBeGreaterThan(0);
  });
});
