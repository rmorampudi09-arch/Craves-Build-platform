import React from 'react';
import {AccessibilityInfo, Text, TextInput} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {AppApiError} from '../../../core/http/apiError';
import {Button} from '../../../shared/components/Button';
import {supportChatApi} from '../api/supportChatApi';
import {SupportChatScreen} from './SupportChatScreen';

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

async function mount() {
  await act(async () => {
    tree = renderer.create(
      <SupportChatScreen contextRole="CUSTOMER" orderId={orderId} />,
    );
  });
}

async function sendMessage(text: string) {
  await act(async () => {
    tree.root.findByType(TextInput).props.onChangeText(text);
  });
  await act(async () => {
    tree.root.findByType(Button).props.onPress();
  });
}

function texts(): string[] {
  return tree.root.findAllByType(Text).map(node => String(node.props.children));
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  act(() => tree.unmount());
});

test('sends the typed message and renders the reply with a ticket confirmation', async () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  jest.mocked(supportChatApi.send).mockResolvedValue({
    reply: 'Your refund is on its way.',
    supportCase: {id: 'case-1', caseNumber: 'CRV-1042'},
  });
  await mount();

  expect(texts()).toContain(
    "You're chatting with Craves' AI assistant. It can make mistakes. Never share OTPs, card numbers or passwords.",
  );
  await sendMessage('  Where is my refund?  ');

  expect(supportChatApi.send).toHaveBeenCalledWith(
    'CUSTOMER',
    [{role: 'user', content: 'Where is my refund?'}],
    orderId,
  );
  expect(texts()).toEqual(
    expect.arrayContaining([
      'Where is my refund?',
      'Your refund is on its way.',
      'Ticket CRV-1042 created — our team will reply in your notifications',
    ]),
  );
  expect(announce).toHaveBeenCalledWith(
    'Your refund is on its way. Ticket CRV-1042 created — our team will reply in your notifications',
  );
  expect(tree.root.findByType(TextInput).props.value).toBe('');
});

test('shows the rate-limit wait and keeps the unsent text', async () => {
  jest
    .mocked(supportChatApi.send)
    .mockRejectedValue(
      new AppApiError(
        'SUPPORT_CHAT_RATE_LIMITED',
        'Too many requests.',
        429,
        undefined,
        true,
        false,
        [],
        30,
      ),
    );
  await mount();

  await sendMessage('Hello?');

  expect(texts()).toContain(
    'Too many messages. Please wait 30 s and try again.',
  );
  expect(texts()).not.toContain('Hello?');
  expect(tree.root.findByType(TextInput).props.value).toBe('Hello?');
});

test('points to email when the assistant is unavailable', async () => {
  jest
    .mocked(supportChatApi.send)
    .mockRejectedValue(
      new AppApiError('SUPPORT_CHAT_UNAVAILABLE', 'Unavailable.', 503),
    );
  await mount();

  await sendMessage('Hello?');

  expect(texts()).toContain('Assistant unavailable — email support@craves.in');
});
