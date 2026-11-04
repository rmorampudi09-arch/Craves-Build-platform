import React from 'react';
import {Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {Provider} from 'react-redux';
import {configureStore} from '@reduxjs/toolkit';
import {authActions, authReducer} from '../../auth/state/authSlice';
import type {Identity} from '../../auth/domain/types';
import {useAccountDeletion} from '../state/AccountDeletionProvider';
import {KeepItGate} from './KeepItGate';

jest.mock('../state/AccountDeletionProvider', () => ({useAccountDeletion: jest.fn()}));
jest.mock('../../../design/reducedMotion', () => ({useReducedMotionPreference: () => false}));

// 12:00 UTC is 5 Dec on every phone from UTC-12 to UTC+11, so the date needs no fixed time zone.
const DUE = '2026-12-05T12:00:00Z';
const identity = (pendingDeletion: Identity['pendingDeletion']): Identity => ({
  id: 'u1',
  firebaseUid: 'f1',
  phoneNumber: '+919876543210',
  email: null,
  emailVerified: false,
  displayName: null,
  status: 'ACTIVE',
  roles: ['CUSTOMER'],
  lastLoginAt: null,
  pendingDeletion,
});
const scheduled = {requestId: 'r1', scope: 'ALL', status: 'SCHEDULED', dueAt: DUE} as const;

const keep = jest.fn();
let store: ReturnType<typeof makeStore>;
let tree: renderer.ReactTestRenderer;
const makeStore = () => configureStore({reducer: {auth: authReducer}});
const lines = () => tree.root.findAllByType(Text).map(t => [t.props.children].flat().join(''));
const button = (label: string) =>
  tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];

function mount(signIn: ReturnType<typeof authActions.signedInFresh | typeof authActions.authenticated>) {
  store = makeStore();
  store.dispatch(signIn);
  jest.mocked(useAccountDeletion).mockReturnValue({
    pending: store.getState().auth.identity?.pendingDeletion ?? null,
    keep,
    keeping: false,
    notice: null,
  });
  act(() => {
    tree = renderer.create(
      <Provider store={store}>
        <KeepItGate>
          <Text>app</Text>
        </KeepItGate>
      </Provider>,
    );
  });
}

describe('KeepItGate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    keep.mockResolvedValue('kept');
  });
  afterEach(() => act(() => tree.unmount()));

  it('asks Keep it? with the date after a fresh sign-in, and Not now goes into the app', () => {
    mount(authActions.signedInFresh(identity(scheduled)));
    expect(lines()).toEqual([
      'Your account will be deleted on 5 Dec',
      'Do you want to keep your account?',
      "If you don't, you can still see your orders until then. New orders stay paused.",
      'Keep my account',
      'Not now',
    ]);
    act(() => {
      button('Not now').props.onPress();
    });
    expect(lines()).toEqual(['app']);
    expect(keep).not.toHaveBeenCalled();
  });

  it('names the side and says the request is with Craves while it has no date', () => {
    mount(authActions.signedInFresh(identity({...scheduled, scope: 'CHEF'})));
    expect(lines()[0]).toBe('Your chef side will be deleted on 5 Dec');
    act(() => tree.unmount());
    mount(authActions.signedInFresh(identity({...scheduled, status: 'PENDING_REVIEW', dueAt: null})));
    expect(lines()[0]).toBe('Your delete request is with Craves');
  });

  it('falls back to the whole-account title for a scope this app does not know', () => {
    mount(authActions.signedInFresh(identity({...scheduled, scope: 'EVERYTHING' as never})));
    expect(lines()[0]).toBe('Your account will be deleted on 5 Dec');
  });

  it('keeps the account, then goes into the app', async () => {
    let finish!: () => void;
    keep.mockReturnValue(new Promise(resolve => (finish = () => resolve('kept'))));
    mount(authActions.signedInFresh(identity(scheduled)));
    act(() => {
      button('Keep my account').props.onPress();
    });
    expect(keep).toHaveBeenCalledTimes(1);
    expect(store.getState().auth.keepItPending).toBe(true);
    await act(async () => finish());
    expect(store.getState().auth.keepItPending).toBe(false);
    expect(lines()).toEqual(['app']);
  });

  it('goes straight into the app on a restored session', () => {
    mount(authActions.authenticated(identity(scheduled)));
    expect(lines()).toEqual(['app']);
  });
});
