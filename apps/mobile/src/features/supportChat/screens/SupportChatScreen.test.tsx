import React from 'react';
import {AccessibilityInfo, Linking, Text, TextInput} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AxiosError, AxiosHeaders, type InternalAxiosRequestConfig} from 'axios';
import {AppApiError, toAppApiError} from '../../../core/http/apiError';
import {httpClient} from '../../../core/http/httpClient';
import {ChefToastProvider} from '../../chefShell/components/ui';
import {richText} from '../components/ChatBubbles';
import {SupportChatScreen} from './SupportChatScreen';

jest.setTimeout(20_000);

let mockReduceMotion = true;
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockOnboarding = {load: jest.fn()};

jest.mock('../../../design/reducedMotion', () => ({
  useReducedMotionPreference: () => mockReduceMotion,
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({goBack: mockGoBack, navigate: mockNavigate}),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));
jest.mock('../../../app/store/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({auth: {identity: {id: 'user-1'}}}),
}));
jest.mock('../../chefOnboarding/api/chefOnboardingApi', () => ({
  chefOnboardingApi: {load: (...args: unknown[]) => mockOnboarding.load(...args)},
}));
jest.mock('../../../core/http/httpClient', () => ({httpClient: {post: jest.fn()}}));

const postMock = httpClient.post as jest.Mock;
const orderId = '11111111-1111-4111-8111-111111111111';
const NOT_PUBLISHED = new AppApiError('HTTP_403', 'Forbidden', 403);
const RATE_MESSAGE = 'Too many messages. Please wait a moment.';
const DAILY_MESSAGE = "You've reached today's chat limit. Please email support@craves.in.";
const GENERIC_429 = 'Too many requests. Please wait a moment and try again.';
/** A 429 as the server sends it, read by the real error parser (the generic text stays in `message`). */
const serverRateLimit = (retryAfter: string | undefined, message = RATE_MESSAGE, code = 'SUPPORT_CHAT_RATE_LIMITED') => {
  const config = {headers: new AxiosHeaders()} as InternalAxiosRequestConfig;
  return toAppApiError(
    new AxiosError('failed', 'ERR_BAD_REQUEST', config, undefined, {
      data: {code, message},
      status: 429,
      statusText: '',
      headers: new AxiosHeaders(retryAfter ? {'Retry-After': retryAfter} : {}),
      config,
    }),
  );
};
let tree: renderer.ReactTestRenderer;

async function mount(contextRole: 'CUSTOMER' | 'CHEF' = 'CUSTOMER', withOrder = contextRole === 'CUSTOMER') {
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false, gcTime: Infinity}}})}>
        <ChefToastProvider>
          <SupportChatScreen contextRole={contextRole} orderId={withOrder ? orderId : undefined} />
        </ChefToastProvider>
      </QueryClientProvider>,
    );
  });
}

const pressables = (label: string) =>
  tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
const byTestId = (testID: string) =>
  tree.root.findAll(node => node.props.testID === testID && typeof node.type !== 'string');
/** The Send button's own Pressable, whatever the screen wraps it in. */
const sendState = () =>
  tree.root.findAll(node => node.props.accessibilityLabel === 'Send message' && node.props.accessibilityState)[0].props
    .accessibilityState as {disabled: boolean; busy: boolean};

async function type(text: string) {
  await act(async () => {
    tree.root.findByType(TextInput).props.onChangeText(text);
  });
}

async function sendMessage(text: string) {
  await type(text);
  await act(async () => {
    pressables('Send message')[0].props.onPress();
  });
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
  postMock.mockResolvedValue({reply: 'Here to help.', supportCase: null});
  mockOnboarding.load.mockResolvedValue({supportPhone: '+918012345678', supportEmail: 'help@craves.in'});
});

afterEach(() => {
  act(() => tree.unmount());
  jest.useRealTimers();
});

describe('customer chat', () => {
  test('shows typing and Sending, then the reply, Sent and the ticket', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    let answer: (value: unknown) => void = () => undefined;
    postMock.mockReturnValue(new Promise(resolve => (answer = resolve)));
    await mount();

    expect(screenText()).toContain(
      "You're chatting with Craves' AI assistant. It can make mistakes. Never share OTPs, card numbers or passwords.",
    );
    await sendMessage('  Where is my refund?  ');

    expect(byTestId('support-chat-typing')).toHaveLength(1);
    expect(screenText()).toMatch(/Where is my refund\?.*Sending/);
    expect(tree.root.findByType(TextInput).props.value).toBe('');
    expect(postMock).toHaveBeenCalledTimes(1);
    const body = postMock.mock.calls[0][1];
    expect(body).toEqual({
      contextRole: 'CUSTOMER',
      channel: 'APP',
      orderId,
      messages: [{role: 'user', content: 'Where is my refund?'}],
    });

    await act(async () => {
      answer({reply: 'Your refund is on its way.', supportCase: {id: 'case-1', caseNumber: 'CRV-1042'}});
    });

    expect(byTestId('support-chat-typing')).toHaveLength(0);
    expect(screenText()).toMatch(
      /Sent.*Your refund is on its way\..*Ticket CRV-1042 created — our team will reply in your notifications/,
    );
    expect(announce).toHaveBeenCalledWith(
      'Your refund is on its way. Ticket CRV-1042 created — our team will reply in your notifications',
    );
  });

  test('asks a suggested question in one tap, then hides the suggestions', async () => {
    postMock.mockResolvedValue({reply: 'Menu › Add dish.', supportCase: null});
    await mount();

    await act(async () => {
      pressables('How do refunds work?')[0].props.onPress();
    });

    expect(postMock.mock.calls[0][1].messages).toEqual([{role: 'user', content: 'How do refunds work?'}]);
    expect(screenText()).toContain('Menu › Add dish.');
    expect(byTestId('support-chat-suggestions')).toHaveLength(0);
  });

  test('sends the history with every turn, never more than the newest 20 messages, ending with the user', async () => {
    await mount();

    for (let turn = 1; turn <= 12; turn++) {
      await sendMessage(`question ${turn}`);
    }

    const sent = postMock.mock.calls.map(([, body]) => body.messages as {role: string; content: string}[]);
    expect(sent.map(history => history.length)).toEqual([1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 20, 20]);
    const last = sent[11];
    expect(last[19]).toEqual({role: 'user', content: 'question 12'});
    expect(last[0]).toEqual({role: 'assistant', content: 'Here to help.'});
    expect(last[18]).toEqual({role: 'assistant', content: 'Here to help.'});
  });

  test('keeps a failed message as Not sent, and Retry resends it with one request', async () => {
    postMock
      .mockRejectedValueOnce(new AppApiError('HTTP_500', 'Craves is temporarily unavailable. Please try again.', 500))
      .mockResolvedValueOnce({reply: 'Here now.', supportCase: null});
    await mount();

    await sendMessage('Hello?');

    expect(screenText()).toContain('Craves is temporarily unavailable. Please try again.');
    expect(screenText()).toMatch(/Hello\?Not sent/);

    await act(async () => {
      pressables('Retry')[0].props.onPress();
      pressables('Retry')[0]?.props.onPress();
    });

    expect(postMock).toHaveBeenCalledTimes(2);
    expect(postMock.mock.calls[1][1].messages).toEqual([{role: 'user', content: 'Hello?'}]);
    expect(screenText()).toContain('Here now.');
    expect(screenText().match(/Hello\?/g)).toHaveLength(1);
    expect(screenText()).not.toContain('Not sent');
  });

  test('sends once per press: Send is busy while a request is open', async () => {
    postMock.mockReturnValue(new Promise(() => undefined));
    await mount();

    await type('First');
    await act(async () => {
      const send = pressables('Send message')[0];
      send.props.onPress();
      send.props.onPress();
    });

    expect(postMock).toHaveBeenCalledTimes(1);
    expect(sendState()).toEqual({disabled: true, busy: true});
  });

  test('shows the rate-limit message, keeps the text, and turns Send off until Retry-After has passed', async () => {
    jest.useFakeTimers();
    postMock.mockRejectedValueOnce(serverRateLimit('30'));
    await mount();

    await sendMessage('Hello?');

    expect(screenText()).toContain('Too many messages. Please wait a moment.');
    expect(screenText()).toMatch(/Hello\?Not sent/);
    await type('Another question');
    expect(sendState().disabled).toBe(true);
    await act(async () => {
      pressables('Send message')[0].props.onPress();
    });
    expect(postMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(29_000);
    });
    expect(sendState().disabled).toBe(true);

    await act(async () => {
      jest.advanceTimersByTime(1_000);
    });
    expect(sendState().disabled).toBe(false);
    expect(screenText()).not.toContain('Too many messages');
    expect(tree.root.findByType(TextInput).props.value).toBe('Another question');

    await act(async () => {
      pressables('Send message')[0].props.onPress();
    });
    expect(postMock).toHaveBeenCalledTimes(2);
  });

  test('shows the server text only for the chat limit: another 429 keeps the generic copy', async () => {
    postMock.mockRejectedValueOnce(serverRateLimit('30', 'Your OTP was sent 3 times today.', 'OTP_RATE_LIMIT'));
    await mount();

    await sendMessage('Hello?');

    expect(screenText()).toContain(GENERIC_429);
    expect(screenText()).not.toContain('OTP was sent');
  });

  test.each([
    ['86400 (a day, more digits than the parser reads)', '86400'],
    ['50000', '50000'],
    ['5000 (over an hour, clamped by the parser)', '5000'],
    ['no Retry-After at all', undefined],
  ])('keeps the daily limit notice and Send off for the whole visit when Retry-After is %s', async (_name, retryAfter) => {
    jest.useFakeTimers();
    postMock.mockRejectedValueOnce(serverRateLimit(retryAfter, DAILY_MESSAGE));
    await mount();

    await sendMessage('Hello?');

    expect(screenText()).toContain(DAILY_MESSAGE);
    expect(sendState().disabled).toBe(true);
    await type('Another question');
    await act(async () => {
      jest.advanceTimersByTime(48 * 60 * 60 * 1000);
    });
    expect(screenText()).toContain(DAILY_MESSAGE);
    expect(sendState().disabled).toBe(true);
    await act(async () => {
      pressables('Send message')[0].props.onPress();
      pressables('Retry')[0].props.onPress();
    });
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(tree.root.findByType(TextInput).props.value).toBe('Another question');
  });

  test('a suggestion tap sends the suggestion and leaves a half-typed message in the box', async () => {
    await mount();

    await type('half typed');
    await act(async () => {
      pressables('How do refunds work?')[0].props.onPress();
    });

    expect(postMock.mock.calls[0][1].messages).toEqual([{role: 'user', content: 'How do refunds work?'}]);
    expect(tree.root.findByType(TextInput).props.value).toBe('half typed');
  });

  test('after a failed send, the next request does not carry the failed text', async () => {
    postMock.mockRejectedValueOnce(new AppApiError('HTTP_500', 'Craves is temporarily unavailable. Please try again.', 500));
    await mount();

    await sendMessage('first try');
    expect(screenText()).toMatch(/first tryNot sent/);
    await sendMessage('second try');

    expect(postMock).toHaveBeenCalledTimes(2);
    expect(postMock.mock.calls[1][1].messages).toEqual([{role: 'user', content: 'second try'}]);
    expect(JSON.stringify(postMock.mock.calls[1][1])).not.toContain('first try');
  });

  test.each([
    ['a 503', new AppApiError('SUPPORT_CHAT_UNAVAILABLE', 'Unavailable.', 503)],
    ['a route the gateway has not published', NOT_PUBLISHED],
  ])('on %s says chat is not available, points to email, and keeps the message', async (_name, failure) => {
    postMock.mockRejectedValue(failure);
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await mount();

    await sendMessage('Hello?');

    expect(screenText()).toContain('Chat is not available right now. Email support@craves.in.');
    expect(screenText()).toMatch(/Hello\?Not sent/);
    await act(async () => {
      pressables('Email us')[0].props.onPress();
    });
    expect(open).toHaveBeenCalledWith('mailto:support@craves.in?subject=Craves%20support');
    open.mockRestore();
  });

  test('reveals a new reply a few words at a time when motion is allowed', async () => {
    mockReduceMotion = false;
    jest.useFakeTimers();
    const reply = Array.from({length: 30}, (_, index) => `word${index}`).join(' ');
    postMock.mockResolvedValue({reply, supportCase: null});
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

  test('goes back from the arrow', async () => {
    await mount();

    await act(async () => {
      pressables('Back')[0].props.onPress();
    });

    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });
});

describe('chef chat', () => {
  test('is the chef board: Chat with us title, plain greeting, and Send as a 48 dp button', async () => {
    await mount('CHEF');

    expect(screenText()).toContain('Chat with us');
    expect(screenText()).toContain(
      "Hi! I'm the Craves support assistant. Ask me about your kitchen's orders, your menu or where to find something in the app.",
    );
    expect(screenText()).toContain("You're chatting with Craves' AI assistant.");
    expect(pressables('Go back')).not.toHaveLength(0);
    expect(pressables('Send message')).not.toHaveLength(0);
  });

  test('sends with the chef role, no order, and asks a suggested question in one tap', async () => {
    await mount('CHEF');

    await act(async () => {
      pressables('How do I add a dish?')[0].props.onPress();
    });

    expect(postMock.mock.calls[0][1]).toEqual({
      contextRole: 'CHEF',
      channel: 'APP',
      messages: [{role: 'user', content: 'How do I add a dish?'}],
    });
    expect(screenText()).toContain('Here to help.');
    expect(pressables('How do I add a dish?')).toHaveLength(0);
  });

  test('sends the order with the chef role when opened from an order page', async () => {
    await mount('CHEF', true);

    expect(screenText()).toContain('Hi! How can I help with this order?');
    await sendMessage('The rider did not come');

    expect(postMock.mock.calls[0][1]).toEqual({
      contextRole: 'CHEF',
      channel: 'APP',
      orderId,
      messages: [{role: 'user', content: 'The rider did not come'}],
    });
  });

  test('shows "Ticket #01042 created" when a ticket is raised, and opens that ticket when tapped', async () => {
    postMock.mockResolvedValue({
      reply: 'I have raised this with our team.',
      supportCase: {id: 'case-1', caseNumber: 'CRV-0000000000000000000000000987'},
    });
    await mount('CHEF');

    await sendMessage('My payout is missing');

    expect(screenText()).toContain('Ticket #00987 created');
    expect(screenText()).not.toContain('CRV-');
    await act(async () => {
      pressables('Ticket #00987 created. Open the ticket.')[0].props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith('ChefSupportTicket', {caseId: 'case-1'});
  });

  test('turns Send off after a 429 until Retry-After has passed, and keeps the failed message', async () => {
    jest.useFakeTimers();
    postMock.mockRejectedValueOnce(serverRateLimit('45'));
    await mount('CHEF');

    await sendMessage('Hello?');

    expect(screenText()).toContain('Too many messages. Please wait a moment.');
    expect(screenText()).toMatch(/Hello\?Not sent/);
    await type('Next');
    expect(sendState().disabled).toBe(true);

    await act(async () => {
      jest.advanceTimersByTime(45_000);
    });
    expect(sendState().disabled).toBe(false);
  });

  test('shows the daily limit notice and keeps Send off for the whole visit', async () => {
    jest.useFakeTimers();
    postMock.mockRejectedValueOnce(serverRateLimit('86400', DAILY_MESSAGE));
    await mount('CHEF');

    await sendMessage('Hello?');
    await type('Next');
    await act(async () => {
      jest.advanceTimersByTime(48 * 60 * 60 * 1000);
    });

    expect(screenText()).toContain(DAILY_MESSAGE);
    expect(sendState().disabled).toBe(true);
  });

  test('a suggestion tap sends the suggestion and leaves a half-typed message in the box', async () => {
    await mount('CHEF');

    await type('half typed');
    await act(async () => {
      pressables('How do I add a dish?')[0].props.onPress();
    });

    expect(postMock.mock.calls[0][1].messages).toEqual([{role: 'user', content: 'How do I add a dish?'}]);
    expect(tree.root.findByType(TextInput).props.value).toBe('half typed');
  });

  test('says chat is not available and offers Call, which dials the Craves support number', async () => {
    postMock.mockRejectedValue(new AppApiError('SUPPORT_CHAT_UNAVAILABLE', 'Unavailable.', 503));
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await mount('CHEF');

    await sendMessage('Hello?');

    expect(screenText()).toContain('Chat is not available right now. Call Craves support.');
    expect(screenText()).toMatch(/Hello\?Not sent/);
    await act(async () => {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    });
    await act(async () => {
      pressables('Call')[0].props.onPress();
    });
    expect(open).toHaveBeenCalledWith('tel:+918012345678');
    open.mockRestore();
  });

  test('says chat is not available when the gateway has not published the route', async () => {
    postMock.mockRejectedValue(NOT_PUBLISHED);
    await mount('CHEF');

    await sendMessage('Hello?');

    expect(screenText()).toContain('Chat is not available right now. Call Craves support.');
    expect(pressables('Call')).not.toHaveLength(0);
  });

  test('keeps what was typed when the request fails for another reason', async () => {
    postMock.mockRejectedValueOnce(new AppApiError('NETWORK_ERROR', 'We could not reach Craves. Check your connection and try again.'));
    await mount('CHEF');

    await sendMessage('Where is my payout?');

    expect(screenText()).toContain('We could not reach Craves. Check your connection and try again.');
    expect(screenText()).toMatch(/Where is my payout\?Not sent/);
    expect(pressables('Retry')).not.toHaveLength(0);
  });
});

describe('richText', () => {
  test('links only Craves pages and contacts, and bolds quoted button names', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await act(async () => {
      tree = renderer.create(
        <Text>
          {richText(
            'Tap "Edit profile" at https://craves.in/profile. Mail support@craves.in, call 8367366787, not https://evil.example/x.',
          )}
        </Text>,
      );
    });

    const links = tree.root.findAll(node => node.props.accessibilityRole === 'link' && typeof node.type !== 'string');
    expect(links.map(link => link.props.children)).toEqual(['craves.in/profile', 'support@craves.in', '8367366787']);
    links.forEach(link => link.props.onPress());
    expect(open.mock.calls.map(([url]) => url)).toEqual([
      'https://craves.in/profile',
      'mailto:support@craves.in',
      'tel:8367366787',
    ]);
    expect(screenText()).toContain('Tap Edit profile at craves.in/profile. Mail');
    expect(screenText()).toContain('not https://evil.example/x.');
    open.mockRestore();
  });
});
