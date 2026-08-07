import {authApi} from '../api/authApi';
import {sessionManager} from '../api/sessionManager';
import {firebaseAuth} from '../firebase/firebaseAuth';
import {authService} from './authService';

jest.mock('../api/authApi', () => ({
  authApi: {logout: jest.fn()},
}));

jest.mock('../api/sessionManager', () => ({
  sessionManager: {clearLocal: jest.fn()},
}));

jest.mock('../firebase/firebaseAuth', () => ({
  firebaseAuth: {signOut: jest.fn()},
}));

const remoteLogoutMock = authApi.logout as jest.Mock;
const clearLocalMock = sessionManager.clearLocal as jest.Mock;
const firebaseSignOutMock = firebaseAuth.signOut as jest.Mock;

describe('authService logout semantics', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    remoteLogoutMock.mockResolvedValue(undefined);
    clearLocalMock.mockResolvedValue(undefined);
    firebaseSignOutMock.mockResolvedValue(undefined);
  });

  it('revokes remotely before clearing local CRAVES and Firebase authentication', async () => {
    await expect(authService.logout()).resolves.toBeUndefined();

    expect(remoteLogoutMock).toHaveBeenCalledTimes(1);
    expect(clearLocalMock).toHaveBeenCalledTimes(1);
    expect(firebaseSignOutMock).toHaveBeenCalledTimes(1);
    expect(remoteLogoutMock.mock.invocationCallOrder[0]).toBeLessThan(
      clearLocalMock.mock.invocationCallOrder[0],
    );
  });

  it('still clears local authentication when remote revocation fails offline', async () => {
    remoteLogoutMock.mockRejectedValue(new Error('offline'));

    await expect(authService.logout()).resolves.toBeUndefined();

    expect(clearLocalMock).toHaveBeenCalledTimes(1);
    expect(firebaseSignOutMock).toHaveBeenCalledTimes(1);
  });
});
