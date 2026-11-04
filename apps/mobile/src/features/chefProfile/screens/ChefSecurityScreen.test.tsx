import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AppApiError} from '../../../core/http/apiError';
import {accountDeletionApi} from '../../accountDeletion/api/accountDeletionApi';
import {ChefToastProvider} from '../../chefShell/components/ui';
import {screenQueries} from '../testing/screenTestKit';
import {ChefSecurityScreen} from './ChefSecurityScreen';

jest.setTimeout(20_000);

const mockNavigate = jest.fn();
let mockIdentity: Record<string, unknown> | null;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({navigate: mockNavigate, goBack: jest.fn()}),
  useFocusEffect: (effect: () => void) => require('react').useEffect(effect, [effect]),
}));
jest.mock('../../accountDeletion/api/accountDeletionApi', () => ({accountDeletionApi: {getLatest: jest.fn()}}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));
jest.mock('../../../design/reducedMotion', () => ({useReducedMotionPreference: () => false}));
jest.mock('../../../app/store/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({auth: {identity: mockIdentity}}),
}));

const getLatest = accountDeletionApi.getLatest as jest.Mock;
const view = {
  requestId: 'request-1',
  scope: 'CHEF',
  status: 'SCHEDULED',
  requestedAt: '2026-11-05T08:00:00Z',
  dueAt: '2026-12-05T08:00:00Z',
  reviewNote: null,
};

let queryClient: QueryClient;
let tree: renderer.ReactTestRenderer;
const ui = screenQueries(() => tree);

async function mount() {
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={queryClient}>
        <ChefToastProvider>
          <ChefSecurityScreen />
        </ChefToastProvider>
      </QueryClientProvider>,
    );
  });
  // react-query hands its result to React on the next timer tick.
  await act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  });
}

describe('ChefSecurityScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient();
    getLatest.mockResolvedValue(null);
    mockIdentity = {id: 'user-1', phoneNumber: '+919876543210', email: 'chef@gmail.com', emailVerified: true};
  });
  afterEach(() => {
    act(() => tree.unmount());
    queryClient.clear();
  });

  it('shows the mobile number and email from the account, with most digits hidden', async () => {
    await mount();
    expect(ui.has('Mobile number')).toBe(true);
    expect(ui.has('+91 ••••• 43210 · used to log in')).toBe(true);
    expect(ui.has('Email')).toBe(true);
    expect(ui.has('c•••@gmail.com')).toBe(true);
    expect(ui.lines().filter(line => line === 'Verified')).toHaveLength(2);
    expect(ui.anyText(/9876543210|chef@gmail/)).toBe(false);
  });

  it('says the email is not verified, or not added, instead of showing a Verified chip', async () => {
    mockIdentity = {id: 'user-1', phoneNumber: '+919876543210', email: 'chef@gmail.com', emailVerified: false};
    await mount();
    expect(ui.has('Not verified')).toBe(true);
    act(() => tree.unmount());
    mockIdentity = {id: 'user-1', phoneNumber: '+919876543210', email: null, emailVerified: false};
    await mount();
    expect(ui.has('Not added')).toBe(true);
  });

  it('marks Log out of other devices as coming soon and not tappable', async () => {
    await mount();
    expect(ui.has('Log out of other devices')).toBe(true);
    expect(ui.byPrefix('Log out of other devices')).toBeUndefined();
    expect(ui.has('Coming soon')).toBe(true);
  });

  it('opens Delete my account when the server says deletion is available', async () => {
    getLatest.mockResolvedValue(view);
    await mount();
    expect(ui.has('Your chef side, or your whole account')).toBe(true);
    act(() => {
      ui.byPrefix('Delete my account')!.props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith('ChefDeleteAccount');
    expect(mockNavigate).not.toHaveBeenCalledWith('ChefSupportTicket', expect.anything());
  });

  it('shows Delete my account when the person never asked to delete', async () => {
    getLatest.mockRejectedValue(new AppApiError('NO_DELETION_REQUEST', 'None', 404));
    await mount();
    expect(ui.has('Delete my account')).toBe(true);
  });

  it('hides Delete my account while the status is loading', async () => {
    getLatest.mockReturnValue(new Promise(() => undefined));
    await mount();
    expect(ui.has('Delete my account')).toBe(false);
    expect(ui.has('Log out of other devices')).toBe(true);
  });

  it.each([
    ['503', new AppApiError('HTTP_503', 'Unavailable', 503)],
    ['a 404 with another code', new AppApiError('NOT_FOUND', 'Not found', 404)],
  ])('hides Delete my account after %s', async (_name, error) => {
    getLatest.mockRejectedValue(error);
    await mount();
    expect(ui.has('Delete my account')).toBe(false);
  });

  it('explains how to change the number and that there is no password', async () => {
    await mount();
    expect(
      ui.has("To change your mobile number, contact support. You log in with a one-time code, so there's no password to manage."),
    ).toBe(true);
  });
});
