import {sessionManager} from '../../auth/api/sessionManager';
import {refreshAfterDeletionChange} from './refreshAfterDeletionChange';

jest.mock('../../auth/api/sessionManager', () => ({
  sessionManager: {refresh: jest.fn()},
}));

describe('refreshAfterDeletionChange', () => {
  it('rotates the session so the identity picks up the change', async () => {
    jest.mocked(sessionManager.refresh).mockResolvedValue(null);

    await refreshAfterDeletionChange();

    expect(sessionManager.refresh).toHaveBeenCalledTimes(1);
  });

  it('swallows a network failure', async () => {
    jest.mocked(sessionManager.refresh).mockRejectedValue(new Error('offline'));

    await expect(refreshAfterDeletionChange()).resolves.toBeUndefined();
  });
});
