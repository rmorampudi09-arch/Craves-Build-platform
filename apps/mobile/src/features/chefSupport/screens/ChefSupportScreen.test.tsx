import React from 'react';
import {Linking} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AppApiError} from '../../../core/http/apiError';
import {ChefToastProvider} from '../../chefShell/components/ui';
import {screenQueries} from '../../chefProfile/testing/screenTestKit';
import {CASE_ID, CLOSED_CASE_ID, supportCase} from '../testing/supportFixtures';
import {ChefSupportScreen} from './ChefSupportScreen';

jest.setTimeout(20_000);

const mockNavigate = jest.fn();
const mockCases = {list: jest.fn()};
const mockOnboarding = {load: jest.fn()};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({navigate: mockNavigate, goBack: jest.fn()}),
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
  chefSupportCasesApi: {list: (...args: unknown[]) => mockCases.list(...args)},
}));
jest.mock('../../chefOnboarding/api/chefOnboardingApi', () => ({
  chefOnboardingApi: {load: (...args: unknown[]) => mockOnboarding.load(...args)},
}));

const NOT_PUBLISHED = new AppApiError('HTTP_403', 'Forbidden', 403);
let tree: renderer.ReactTestRenderer;
const ui = screenQueries(() => tree);

async function mount() {
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false, gcTime: Infinity}}})}>
        <ChefToastProvider>
          <ChefSupportScreen />
        </ChefToastProvider>
      </QueryClientProvider>,
    );
  });
  await ui.settle();
}

describe('ChefSupportScreen', () => {
  let openUrl: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    mockOnboarding.load.mockResolvedValue({supportPhone: '+918012345678', supportEmail: 'help@craves.in'});
    mockCases.list.mockResolvedValue({
      cases: [
        supportCase(),
        supportCase({
          id: CLOSED_CASE_ID,
          caseNumber: 'CRV-0000000000000000000000000987',
          subject: 'Order #79F4F',
          status: 'CLOSED',
          closedAt: '2026-10-02T10:00:00Z',
          lastSupportMessageAt: '2026-10-02T09:00:00Z',
        }),
      ],
      nextCursor: null,
      hasMore: false,
    });
  });
  afterEach(() => {
    openUrl.mockRestore();
    act(() => tree.unmount());
  });

  it('shows the help card, the common topics and the chef tickets with plain status words', async () => {
    await mount();
    expect(ui.has('How can we help?')).toBe(true);
    expect(ui.has('Common topics')).toBe(true);
    for (const topic of ['Problem with an order', 'Payout not received', 'Delivery partner issue', 'Update a document']) {
      expect(ui.byPrefix(topic)).toBeDefined();
    }
    expect(ui.has('Your tickets')).toBe(true);
    expect(ui.byPrefix('#01042 · Payout not received')?.props.accessibilityLabel).toContain('Craves replied');
    expect(ui.byPrefix('#00987 · Order #79F4F')?.props.accessibilityLabel).toContain('Closed');
    expect(ui.has('Open')).toBe(true);
    expect(ui.has('Closed')).toBe(true);
    expect(ui.anyText(/CRV-|OPEN|CLOSED|IN_PROGRESS/)).toBe(false);
  });

  it('calls the Craves support number', async () => {
    await mount();
    await ui.press('Call');
    expect(openUrl).toHaveBeenCalledWith('tel:+918012345678');
  });

  it('opens a new chat, a chat with a topic, and an existing ticket', async () => {
    await mount();
    await ui.press('Chat with us');
    expect(mockNavigate).toHaveBeenLastCalledWith('ChefSupportTicket', {});
    await ui.press('Payout not received');
    expect(mockNavigate).toHaveBeenLastCalledWith('ChefSupportTicket', {topic: 'Payout not received'});
    await ui.press('#01042 · Payout not received');
    expect(mockNavigate).toHaveBeenLastCalledWith('ChefSupportTicket', {caseId: CASE_ID});
  });

  it('shows Coming soon for the tickets when the route is not published, and the Call button still works', async () => {
    mockCases.list.mockRejectedValue(NOT_PUBLISHED);
    await mount();
    expect(ui.has('Your tickets are on their way')).toBe(true);
    expect(ui.anyText(/unavailable|failed|try again|route/i)).toBe(false);
    await ui.press('Call');
    expect(openUrl).toHaveBeenCalledWith('tel:+918012345678');
  });

  it('says there are no tickets yet when the chef has none', async () => {
    mockCases.list.mockResolvedValue({cases: [], nextCursor: null, hasMore: false});
    await mount();
    expect(ui.has('No tickets yet')).toBe(true);
  });

  it('leaves out the Call button when Craves has no number to show', async () => {
    mockOnboarding.load.mockRejectedValue(new Error('network'));
    await mount();
    expect(ui.byLabel('Call')).toBeUndefined();
    expect(ui.byLabel('Chat with us')).toBeDefined();
  });
});
