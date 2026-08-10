/**
 * @format
 */

import React from 'react';
import {AppState, type AppStateStatus} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import {useAppDispatch, useAppSelector} from '../../../app/store/hooks';
import {toAppApiError} from '../../../core/http/apiError';
import {tokenMemory} from '../../../core/security/tokenMemory';
import {sessionManager} from '../api/sessionManager';
import {authActions} from '../state/authSlice';
import {useSessionLifecycle} from './useSessionLifecycle';

jest.mock('../../../app/store/hooks', () => ({
  useAppDispatch: jest.fn(),
  useAppSelector: jest.fn(),
}));

jest.mock('../../../core/http/apiError', () => ({
  toAppApiError: jest.fn(),
}));

jest.mock('../../../core/security/tokenMemory', () => ({
  tokenMemory: {
    millisecondsUntilRefresh: jest.fn(),
    isFresh: jest.fn(),
  },
}));

jest.mock('../api/sessionManager', () => ({
  sessionManager: {
    subscribeInvalidation: jest.fn(),
    refresh: jest.fn(),
  },
}));

jest.mock('../state/authSlice', () => ({
  authActions: {
    signedOut: jest.fn(),
  },
}));

const signedOutAction = {type: 'auth/signedOut'};

function Harness() {
  useSessionLifecycle();
  return null;
}

async function mountHarness() {
  let renderer: ReturnType<typeof ReactTestRenderer.create> | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<Harness />);
  });

  if (!renderer) {
    throw new Error('Expected renderer to be created');
  }

  return renderer;
}

describe('useSessionLifecycle', () => {
  const dispatch = jest.fn();
  const invalidationUnsubscribe = jest.fn();
  const appStateRemove = jest.fn();
  let appStateListener: ((state: AppStateStatus) => void) | undefined;
  let currentStateDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();

    currentStateDescriptor = Object.getOwnPropertyDescriptor(AppState, 'currentState');
    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      value: 'active',
    });

    (useAppDispatch as jest.Mock).mockReturnValue(dispatch);
    (useAppSelector as jest.Mock).mockReturnValue('authenticated');
    (authActions.signedOut as unknown as jest.Mock).mockReturnValue(signedOutAction);
    (sessionManager.subscribeInvalidation as jest.Mock).mockReturnValue(
      invalidationUnsubscribe,
    );
    (sessionManager.refresh as jest.Mock).mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAtEpochMs: Date.now() + 120_000,
    });
    (tokenMemory.millisecondsUntilRefresh as jest.Mock).mockReturnValue(1_000);
    (tokenMemory.isFresh as jest.Mock).mockReturnValue(true);
    (toAppApiError as jest.Mock).mockReturnValue({
      code: 'UNEXPECTED',
      message: 'Unexpected failure',
      retriable: false,
      status: 400,
    });

    appStateListener = undefined;
    const addEventListenerMock = jest.spyOn(
      AppState,
      'addEventListener',
    ) as unknown as jest.Mock;
    addEventListenerMock.mockImplementation(
      (event: string, listener: (state: AppStateStatus) => void) => {
        expect(event).toBe('change');
        appStateListener = listener;
        return {remove: appStateRemove};
      },
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();

    if (currentStateDescriptor) {
      Object.defineProperty(AppState, 'currentState', currentStateDescriptor);
    } else {
      delete (AppState as unknown as {currentState?: AppStateStatus}).currentState;
    }
  });

  test('cleans invalidation, AppState, and refresh timer resources on unmount', async () => {
    const renderer = await mountHarness();

    expect(sessionManager.subscribeInvalidation).toHaveBeenCalledTimes(1);
    expect(AppState.addEventListener).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(1);

    await ReactTestRenderer.act(() => {
      renderer.unmount();
    });

    expect(invalidationUnsubscribe).toHaveBeenCalledTimes(1);
    expect(appStateRemove).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('signs out when a scheduled refresh no longer returns a session', async () => {
    (sessionManager.refresh as jest.Mock).mockResolvedValue(null);
    const renderer = await mountHarness();

    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(1_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(sessionManager.refresh).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(signedOutAction);
    expect(jest.getTimerCount()).toBe(0);

    await ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });

  test('retries a retriable refresh failure without prematurely signing out', async () => {
    (sessionManager.refresh as jest.Mock)
      .mockRejectedValueOnce(new Error('temporary network failure'))
      .mockResolvedValueOnce({
        accessToken: 'next-access-token',
        refreshToken: 'next-refresh-token',
        expiresAtEpochMs: Date.now() + 120_000,
      });
    (toAppApiError as jest.Mock).mockReturnValue({
      code: 'NETWORK',
      message: 'Network unavailable',
      retriable: true,
    });

    const renderer = await mountHarness();

    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(1_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(sessionManager.refresh).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalledWith(signedOutAction);
    expect(jest.getTimerCount()).toBe(1);

    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(59_999);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(sessionManager.refresh).toHaveBeenCalledTimes(1);

    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(1);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(sessionManager.refresh).toHaveBeenCalledTimes(2);

    await ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });

  test('clears scheduled work in background and refreshes immediately when stale on resume', async () => {
    const renderer = await mountHarness();
    expect(appStateListener).toBeDefined();
    expect(jest.getTimerCount()).toBe(1);

    await ReactTestRenderer.act(() => {
      appStateListener?.('background');
    });
    expect(jest.getTimerCount()).toBe(0);

    (tokenMemory.isFresh as jest.Mock).mockReturnValue(false);
    await ReactTestRenderer.act(async () => {
      appStateListener?.('active');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(sessionManager.refresh).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(1);

    await ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });
});
