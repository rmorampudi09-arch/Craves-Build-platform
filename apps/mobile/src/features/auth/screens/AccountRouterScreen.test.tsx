import React from 'react';
import {Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {AppApiError} from '../../../core/http/apiError';
import {accountResolutionService} from '../state/accountResolutionService';
import {AccountRouterScreen} from './AccountRouterScreen';

const mockDispatch = jest.fn();
let mockAuth: Record<string, unknown>;

jest.mock('@react-navigation/native', () => ({useNavigation: () => ({goBack: jest.fn()})}));
jest.mock('../../../app/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (select: (state: unknown) => unknown) => select({auth: mockAuth}),
}));
jest.mock('../state/accountResolutionService', () => ({accountResolutionService: {resolve: jest.fn()}}));
jest.mock('../state/authService', () => ({authService: {logout: jest.fn()}}));
jest.mock('../../../design/reducedMotion', () => ({useReducedMotionPreference: () => false}));

const resolve = jest.mocked(accountResolutionService.resolve);
let tree: renderer.ReactTestRenderer;
const lines = () => tree.root.findAllByType(Text).map(t => [t.props.children].flat().join(''));
const button = (label: string) =>
  tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
const erasing = (scope: string) => ({requestId: 'r1', scope, status: 'ERASING', dueAt: null});

async function mount(selectedRole: string, pendingDeletion: unknown = null) {
  mockAuth = {selectedRole, identity: {id: 'u1', pendingDeletion}};
  await act(async () => {
    tree = renderer.create(<AccountRouterScreen />);
  });
}

describe('AccountRouterScreen', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => act(() => tree.unmount()));

  it('shows that the account is not available, with Sign out, when the identity is not active', async () => {
    resolve.mockRejectedValue(new AppApiError('IDENTITY_NOT_ACTIVE', 'This Craves account is not currently active.', 403));
    await mount('CUSTOMER');
    expect(lines()).toContain("This account isn't available");
    expect(lines()).toContain('Sign out');
    expect(lines()).not.toContain('We could not verify your account');
    expect(lines()).not.toContain('Try again');
  });

  it('keeps the generic error with Try again for every other failure', async () => {
    resolve.mockRejectedValue(new AppApiError('ACCOUNT_ROLE_NOT_AUTHORIZED', 'This Craves role is not authorized for your account.', 403));
    await mount('CUSTOMER');
    expect(lines()).toEqual(
      expect.arrayContaining(['We could not verify your account', 'This Craves role is not authorized for your account.', 'Try again', 'Sign out']),
    );
  });

  it('resolves the account as before', async () => {
    const result = {identity: {id: 'u1'}, resolution: {flow: 'CUSTOMER'}};
    resolve.mockResolvedValue(result as never);
    await mount('CUSTOMER');
    expect(resolve).toHaveBeenCalledWith('CUSTOMER');
    expect(mockDispatch).toHaveBeenCalledWith({type: 'auth/accountResolved', payload: result});
  });

  it('tells a chef whose chef side is being deleted, and moves them to the customer side', async () => {
    await mount('CHEF', erasing('CHEF'));
    expect(resolve).not.toHaveBeenCalled();
    expect(lines()).toEqual(['Your chef side is being deleted', "This can't be stopped now.", 'Go to customer side']);
    act(() => button('Go to customer side').props.onPress());
    expect(mockDispatch).toHaveBeenCalledWith({type: 'auth/roleSelected', payload: 'CUSTOMER'});
  });

  it('resolves chef mode as before when only the customer side is being deleted', async () => {
    resolve.mockReturnValue(new Promise(() => undefined));
    await mount('CHEF', erasing('CUSTOMER'));
    expect(resolve).toHaveBeenCalledWith('CHEF');
  });
});
