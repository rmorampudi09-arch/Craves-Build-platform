import React from 'react';
import {Text} from 'react-native';
import renderer, {act, type ReactTestInstance} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AppApiError} from '../../../core/http/apiError';
import {accountDeletionApi} from '../../accountDeletion/api/accountDeletionApi';
import {CustomerSettingsPrivacySecurityScreen} from './CustomerSettingsLegacyScreens';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({navigate: mockNavigate, goBack: jest.fn()}),
  useFocusEffect: (effect: () => void) => require('react').useEffect(effect, [effect]),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));
jest.mock('../../../app/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (select: (state: unknown) => unknown) => select({auth: {identity: {id: 'identity-1'}}}),
}));
jest.mock('../../accountDeletion/api/accountDeletionApi', () => ({accountDeletionApi: {getLatest: jest.fn()}}));

const getLatest = accountDeletionApi.getLatest as jest.Mock;
const view = {
  requestId: 'request-1',
  scope: 'ALL',
  status: 'SCHEDULED',
  requestedAt: '2026-11-05T08:00:00Z',
  dueAt: '2026-12-05T08:00:00Z',
  reviewNote: null,
};

let queryClient: QueryClient;
let tree: renderer.ReactTestRenderer;

async function mount() {
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={queryClient}>
        <CustomerSettingsPrivacySecurityScreen />
      </QueryClientProvider>,
    );
  });
  // react-query hands its result to React on the next timer tick.
  await act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  });
}

const texts = () => tree.root.findAllByType(Text).map(node => String(node.props.children));
const deleteRow = (): ReactTestInstance | undefined =>
  tree.root.findAll(node => node.props.accessibilityLabel === 'Delete account' && typeof node.props.onPress === 'function')[0];

describe('CustomerSettingsPrivacySecurityScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient();
  });
  afterEach(() => {
    act(() => tree.unmount());
    queryClient.clear();
  });

  it('shows Delete account under Your account and opens the delete screen', async () => {
    getLatest.mockResolvedValue(view);
    await mount();
    expect(texts()).toEqual(expect.arrayContaining(['Password, sign-out and your account', 'Your account', 'Delete account']));
    expect(texts()).toContain('Your details are removed 30 days after you ask');
    act(() => {
      deleteRow()!.props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith('CustomerSettingsDeleteAccount');
  });

  it('shows Delete account when the person never asked to delete', async () => {
    getLatest.mockRejectedValue(new AppApiError('NO_DELETION_REQUEST', 'None', 404));
    await mount();
    expect(deleteRow()).toBeDefined();
  });

  it('keeps the password and log out rows whether or not Delete account shows', async () => {
    getLatest.mockRejectedValue(new AppApiError('HTTP_503', 'Unavailable', 503));
    await mount();
    expect(texts()).toEqual(expect.arrayContaining(['Change password', 'Log out of this device']));
  });

  it('hides Delete account and its label while the status is loading', async () => {
    getLatest.mockReturnValue(new Promise(() => undefined));
    await mount();
    expect(deleteRow()).toBeUndefined();
    expect(texts()).not.toContain('Your account');
  });

  it.each([
    ['503', new AppApiError('HTTP_503', 'Unavailable', 503)],
    ['a 404 with another code', new AppApiError('NOT_FOUND', 'Not found', 404)],
  ])('hides Delete account and its label after %s', async (_name, error) => {
    getLatest.mockRejectedValue(error);
    await mount();
    expect(deleteRow()).toBeUndefined();
    expect(texts()).not.toContain('Your account');
  });
});
