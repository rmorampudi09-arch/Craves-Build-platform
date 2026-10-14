import React from 'react';
import {Linking, TextInput} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AppApiError} from '../../../core/http/apiError';
import {ChefToastProvider} from '../../chefShell/components/ui';
import {deferred, screenQueries} from '../../chefProfile/testing/screenTestKit';
import {CASE_ID, CLOSED_CASE_ID, supportDetail} from '../testing/supportFixtures';
import {ChefSupportTicketScreen} from './ChefSupportTicketScreen';

jest.setTimeout(20_000);

const mockReplace = jest.fn();
const mockCases = {get: jest.fn(), create: jest.fn(), addMessage: jest.fn()};
const mockOnboarding = {load: jest.fn()};
let mockParams: {caseId?: string; orderId?: string; topic?: string} = {};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({goBack: jest.fn(), replace: mockReplace, navigate: jest.fn()}),
  useRoute: () => ({params: mockParams}),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));
jest.mock('../../../design/reducedMotion', () => ({useReducedMotionPreference: () => false}));
jest.mock('../../../app/store/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({auth: {identity: {id: 'user-1'}}}),
}));
jest.mock('../api/chefSupportCasesApi', () => ({
  ...jest.requireActual('../api/chefSupportCasesApi'),
  chefSupportCasesApi: {
    get: (...args: unknown[]) => mockCases.get(...args),
    create: (...args: unknown[]) => mockCases.create(...args),
    addMessage: (...args: unknown[]) => mockCases.addMessage(...args),
  },
}));

jest.mock('../../chefOnboarding/api/chefOnboardingApi', () => ({
  chefOnboardingApi: {load: (...args: unknown[]) => mockOnboarding.load(...args)},
}));

const NOT_PUBLISHED = new AppApiError('HTTP_404', 'Not found', 404);
const ORDER_ID = '44444444-4444-4444-8444-444444479f4f';
let tree: renderer.ReactTestRenderer;
const ui = screenQueries(() => tree);

const composer = () => tree.root.findAllByType(TextInput)[0];
const type = (text: string) =>
  act(async () => {
    composer().props.onChangeText(text);
  });

async function mount(params: typeof mockParams) {
  mockParams = params;
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false, gcTime: Infinity}}})}>
        <ChefToastProvider>
          <ChefSupportTicketScreen />
        </ChefToastProvider>
      </QueryClientProvider>,
    );
  });
  await ui.settle();
}

describe('ChefSupportTicketScreen', () => {
  let openUrl: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    mockCases.get.mockResolvedValue(supportDetail());
    mockOnboarding.load.mockResolvedValue({supportPhone: '+918012345678', supportEmail: 'help@craves.in'});
    openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  });
  afterEach(() => {
    openUrl.mockRestore();
    act(() => tree.unmount());
  });

  it('shows the conversation with the ticket number, the subject and who wrote each message', async () => {
    await mount({caseId: CASE_ID});
    expect(mockCases.get).toHaveBeenCalledWith(CASE_ID, expect.anything());
    expect(ui.has('#01042')).toBe(true);
    expect(ui.has('Payout not received')).toBe(true);
    expect(ui.has('Open')).toBe(true);
    expect(ui.has("My payout of ₹2,000 from 6 Oct hasn't reached my bank.")).toBe(true);
    expect(ui.has('Craves support')).toBe(true);
    expect(ui.anyText(/SUPPORT|CHEF|CRV-/)).toBe(false);
  });

  it('adds a reply to the ticket with addMessage', async () => {
    const reply = supportDetail(
      {},
      {
        messages: [
          ...supportDetail().messages,
          {id: 'm3', senderIdentityId: 'x', senderRole: 'CHEF', body: 'The IFSC is updated now.', internalNote: false, createdAt: new Date().toISOString()},
        ],
      },
    );
    mockCases.addMessage.mockResolvedValue(reply);
    await mount({caseId: CASE_ID});
    await type('The IFSC is updated now.');
    await ui.press('Send');
    await ui.settle();
    expect(mockCases.addMessage).toHaveBeenCalledWith(CASE_ID, {message: 'The IFSC is updated now.'});
    expect(ui.has('The IFSC is updated now.')).toBe(true);
    expect(composer().props.value).toBe('');
  });

  it('sends a reply once even when Send is pressed twice', async () => {
    const pending = deferred<ReturnType<typeof supportDetail>>();
    mockCases.addMessage.mockReturnValue(pending.promise);
    await mount({caseId: CASE_ID});
    await type('Hello');
    await ui.press('Send');
    await ui.press('Send');
    expect(mockCases.addMessage).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(supportDetail()));
  });

  it('does not send an empty reply', async () => {
    await mount({caseId: CASE_ID});
    await type('   ');
    await ui.press('Send');
    expect(mockCases.addMessage).not.toHaveBeenCalled();
  });

  it('keeps the words the chef wrote when a reply could not be sent', async () => {
    mockCases.addMessage.mockRejectedValue(new Error('network'));
    await mount({caseId: CASE_ID});
    await type('Please check again');
    await ui.press('Send');
    await ui.settle();
    expect(composer().props.value).toBe('Please check again');
    expect(ui.has("We couldn't send that. Your message is still here.")).toBe(true);
  });

  it('shows a closed ticket without a reply box and offers a new chat', async () => {
    mockCases.get.mockResolvedValue(supportDetail({id: CLOSED_CASE_ID, status: 'CLOSED', closedAt: '2026-10-02T10:00:00Z'}));
    await mount({caseId: CLOSED_CASE_ID});
    expect(ui.has('This ticket is closed')).toBe(true);
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    await ui.press('Start a new chat');
    expect(mockReplace).toHaveBeenCalledWith('ChefSupportTicket', {});
  });

  it('starts a chat on a topic: the first message opens the case, the next ones are replies', async () => {
    mockCases.create.mockResolvedValue(supportDetail());
    mockCases.addMessage.mockResolvedValue(supportDetail());
    await mount({topic: 'Payout not received'});
    expect(mockCases.get).not.toHaveBeenCalled();
    expect(ui.has('Chat with us')).toBe(true);
    expect(ui.has('Payout not received')).toBe(true);

    await type('My payout has not arrived.');
    await ui.press('Send');
    await ui.settle();
    expect(mockCases.create).toHaveBeenCalledWith({
      contextRole: 'CHEF',
      orderId: null,
      subject: 'Payout not received',
      message: 'My payout has not arrived.',
    });
    expect(ui.has('#01042')).toBe(true);

    await type('Any news?');
    await ui.press('Send');
    await ui.settle();
    expect(mockCases.addMessage).toHaveBeenCalledWith(CASE_ID, {message: 'Any news?'});
    expect(mockCases.create).toHaveBeenCalledTimes(1);
  });

  it('puts the order number in the subject when the chat is about an order', async () => {
    mockCases.create.mockResolvedValue(supportDetail());
    await mount({orderId: ORDER_ID, topic: 'Problem with an order'});
    await type('The customer says it was cold.');
    await ui.press('Send');
    await ui.settle();
    expect(mockCases.create).toHaveBeenCalledWith({
      contextRole: 'CHEF',
      orderId: ORDER_ID,
      subject: 'Problem with an order · #44444444',
      message: 'The customer says it was cold.',
    });
  });

  it('uses a general subject for a chat with no topic', async () => {
    mockCases.create.mockResolvedValue(supportDetail());
    await mount({});
    await type('Hi');
    await ui.press('Send');
    await ui.settle();
    expect(mockCases.create).toHaveBeenCalledWith(expect.objectContaining({subject: 'General question'}));
  });

  it('shows Coming soon when the ticket route is not published, on opening a ticket and on sending a first message', async () => {
    mockCases.get.mockRejectedValue(NOT_PUBLISHED);
    await mount({caseId: CASE_ID});
    expect(ui.has('Chat is on its way')).toBe(true);
    expect(ui.anyText(/unavailable|failed|try again|route/i)).toBe(false);
    act(() => tree.unmount());

    mockCases.create.mockRejectedValue(NOT_PUBLISHED);
    await mount({topic: 'Payout not received'});
    await type('Hello');
    await ui.press('Send');
    await ui.settle();
    expect(ui.has('Chat is on its way')).toBe(true);
  });

  it.each(['Delete my account', 'Move my kitchen', 'Update a document', undefined])(
    'keeps what the chef typed and offers Call when support is not published (topic: %s)',
    async topic => {
      mockCases.create.mockRejectedValue(NOT_PUBLISHED);
      await mount(topic ? {topic} : {});
      await type('Please help me with this');
      await ui.press('Send');
      await ui.settle();
      expect(ui.has('Chat is on its way')).toBe(true);
      // Nothing the chef wrote is thrown away: the words stay in the box, and sending is off until chat exists.
      expect(composer().props.value).toBe('Please help me with this');
      expect(ui.byLabel('Send')!.props.accessibilityState.disabled).toBe(true);
      expect(mockCases.create).toHaveBeenCalledTimes(1);
      await ui.press('Call');
      expect(openUrl).toHaveBeenCalledWith('tel:+918012345678');
    },
  );

  it('says so plainly when the number cannot be loaded for the Call button', async () => {
    mockCases.create.mockRejectedValue(NOT_PUBLISHED);
    mockOnboarding.load.mockRejectedValue(new Error('offline'));
    await mount({topic: 'Move my kitchen'});
    await type('Hello');
    await ui.press('Send');
    await ui.settle();
    await ui.press('Call');
    await ui.settle();
    expect(openUrl).not.toHaveBeenCalled();
    expect(ui.has("We couldn't get our phone number just now. Please try again in a moment.")).toBe(true);
    expect(composer().props.value).toBe('Hello');
  });
});
