import React from 'react';
import {AccessibilityInfo, Linking, Text, TextInput} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {AppApiError} from '../../../core/http/apiError';
import {supportChatApi} from '../api/supportChatApi';
import {richText, SupportChatScreen} from './SupportChatScreen';

let mockReduceMotion = true;
jest.mock('../../../design/reducedMotion', () => ({
  useReducedMotionPreference: () => mockReduceMotion,
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({goBack: jest.fn()}),
}));
jest.mock('../../../shared/components/ScreenShell', () => ({
  ScreenShell: ({children}: React.PropsWithChildren) => children,
}));
jest.mock('../api/supportChatApi', () => ({
  ...jest.requireActual('../api/supportChatApi'),
  supportChatApi: {send: jest.fn()},
}));

const orderId = '11111111-1111-4111-8111-111111111111';
let tree: renderer.ReactTestRenderer;

async function mount(contextRole: 'CUSTOMER' | 'CHEF' = 'CUSTOMER') {
  await act(async () => {
    tree = renderer.create(
      <SupportChatScreen
        contextRole={contextRole}
        orderId={contextRole === 'CUSTOMER' ? orderId : undefined}
      />,
    );
  });
}

const byTestId = (testID: string) =>
  tree.root.findAll(node => node.props.testID === testID && typeof node.type !== 'string');

async function press(testID: string) {
  await act(async () => {
    byTestId(testID)[0].props.onPress();
  });
}

async function sendMessage(text: string) {
  await act(async () => {
    tree.root.findByType(TextInput).props.onChangeText(text);
  });
  await press('support-chat-send');
}

/** Everything a sighted user can read, nested link and bold spans included. */
function screenText(): string {
  const read = (node: unknown): string =>
    typeof node === 'string'
      ? node
      : Array.isArray(node)
        ? node.map(read).join('')
        : node && typeof node === 'object' && 'children' in node
          ? read((node as {children: unknown}).children ?? [])
          : '';
  return read(tree.toJSON());
}

beforeEach(() => {
  jest.clearAllMocks();
  mockReduceMotion = true;
});

afterEach(() => {
  act(() => tree.unmount());
  jest.useRealTimers();
});

test('shows typing and Sending, then the reply, Sent and the ticket', async () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  let answer: (value: Awaited<ReturnType<typeof supportChatApi.send>>) => void = () => undefined;
  jest.mocked(supportChatApi.send).mockReturnValue(new Promise(resolve => (answer = resolve)));
  await mount();

  expect(screenText()).toContain(
    "You're chatting with Craves' AI assistant. It can make mistakes. Never share OTPs, card numbers or passwords.",
  );
  await sendMessage('  Where is my refund?  ');

  expect(byTestId('support-chat-typing')).toHaveLength(1);
  expect(screenText()).toMatch(/Where is my refund\?.*Sending/);
  expect(tree.root.findByType(TextInput).props.value).toBe('');
  expect(supportChatApi.send).toHaveBeenCalledWith(
    'CUSTOMER',
    [{role: 'user', content: 'Where is my refund?'}],
    orderId,
  );

  await act(async () => {
    answer({reply: 'Your refund is on its way.', supportCase: {id: 'case-1', caseNumber: 'CRV-1042'}});
  });

  expect(byTestId('support-chat-typing')).toHaveLength(0);
  expect(screenText()).toMatch(/Sent.*Your refund is on its way\..*Ticket CRV-1042 created — our team will reply in your notifications/);
  expect(announce).toHaveBeenCalledWith(
    'Your refund is on its way. Ticket CRV-1042 created — our team will reply in your notifications',
  );
});

test('asks a suggested question in one tap, then hides the suggestions', async () => {
  jest.mocked(supportChatApi.send).mockResolvedValue({reply: 'Menu › Add dish.', supportCase: null});
  await mount('CHEF');

  const chip = tree.root.findAll(node => node.props.accessibilityLabel === 'How do I add a dish?')[0];
  await act(async () => {
    chip.props.onPress();
  });

  expect(supportChatApi.send).toHaveBeenCalledWith(
    'CHEF',
    [{role: 'user', content: 'How do I add a dish?'}],
    undefined,
  );
  expect(screenText()).toContain('Menu › Add dish.');
  expect(byTestId('support-chat-suggestions')).toHaveLength(0);
});

test('keeps a failed message as Not sent with the rate-limit wait, and Retry resends it once', async () => {
  jest
    .mocked(supportChatApi.send)
    .mockRejectedValueOnce(
      new AppApiError('SUPPORT_CHAT_RATE_LIMITED', 'Too many requests.', 429, undefined, true, false, [], 30),
    )
    .mockResolvedValueOnce({reply: 'Here now.', supportCase: null});
  await mount();

  await sendMessage('Hello?');

  expect(screenText()).toContain('Too many messages. Please wait 30 s and try again.');
  expect(screenText()).toMatch(/Hello\?Not sent/);

  await press('support-chat-retry');

  expect(jest.mocked(supportChatApi.send).mock.calls[1][1]).toEqual([{role: 'user', content: 'Hello?'}]);
  expect(screenText()).toContain('Here now.');
  expect(screenText().match(/Hello\?/g)).toHaveLength(1);
  expect(screenText()).not.toContain('Not sent');
});

test('points to email when the assistant is unavailable', async () => {
  jest
    .mocked(supportChatApi.send)
    .mockRejectedValue(new AppApiError('SUPPORT_CHAT_UNAVAILABLE', 'Unavailable.', 503));
  await mount();

  await sendMessage('Hello?');

  expect(screenText()).toContain('Assistant unavailable — email support@craves.in');
});

test('reveals a new reply a few words at a time when motion is allowed', async () => {
  mockReduceMotion = false;
  jest.useFakeTimers();
  const reply = Array.from({length: 30}, (_, index) => `word${index}`).join(' ');
  jest.mocked(supportChatApi.send).mockResolvedValue({reply, supportCase: null});
  await mount();

  await sendMessage('Tell me everything');

  expect(screenText()).not.toContain(reply);
  // Each step schedules the next after React commits, so tick frame by frame.
  for (let frame = 0; frame < 45; frame++) {
    await act(async () => {
      jest.advanceTimersByTime(32);
    });
  }
  expect(screenText()).toContain(reply);
});

test('links only Craves pages and contacts, and bolds quoted button names', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  await act(async () => {
    tree = renderer.create(
      <Text>
        {richText('Tap "Edit profile" at https://craves.in/profile. Mail support@craves.in, call 8367366787, not https://evil.example/x.')}
      </Text>,
    );
  });

  const links = tree.root.findAll(
    node => node.props.accessibilityRole === 'link' && typeof node.type !== 'string',
  );
  expect(links.map(link => link.props.children)).toEqual([
    'craves.in/profile',
    'support@craves.in',
    '8367366787',
  ]);
  links.forEach(link => link.props.onPress());
  expect(open.mock.calls.map(([url]) => url)).toEqual([
    'https://craves.in/profile',
    'mailto:support@craves.in',
    'tel:8367366787',
  ]);
  expect(screenText()).toContain('Tap Edit profile at craves.in/profile. Mail');
  expect(screenText()).toContain('not https://evil.example/x.');
});
