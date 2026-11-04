import {AxiosError} from 'axios';
import {AppApiError} from '../../../core/http/apiError';
import {httpClient} from '../../../core/http/httpClient';
import {ACCOUNT_DELETION_PATH, accountDeletionApi} from './accountDeletionApi';

jest.mock('../../../core/http/httpClient', () => ({
  httpClient: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
}));

const getMock = httpClient.get as jest.Mock;
const postMock = httpClient.post as jest.Mock;
const deleteMock = httpClient.delete as jest.Mock;

const view = {
  requestId: 'request-1',
  scope: 'CHEF',
  status: 'SCHEDULED',
  requestedAt: '2026-11-05T08:00:00Z',
  dueAt: '2026-12-05T08:00:00Z',
  reviewNote: null,
};

function httpError(status: number, code: string): AxiosError {
  return new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText: '',
    headers: {},
    config: {} as never,
    data: {code},
  });
}

async function rejection(promise: Promise<unknown>): Promise<AppApiError> {
  try {
    await promise;
  } catch (error) {
    return error as AppApiError;
  }
  throw new Error('expected the call to reject');
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('accountDeletionApi', () => {
  it('uses the auth deletion path', () => {
    expect(ACCOUNT_DELETION_PATH).toBe('/api/v1/auth/me/deletion');
  });

  describe('getLatest', () => {
    it('returns the parsed view', async () => {
      getMock.mockResolvedValue(view);

      await expect(accountDeletionApi.getLatest()).resolves.toEqual(view);
      expect(getMock).toHaveBeenCalledWith(ACCOUNT_DELETION_PATH);
    });

    it('keeps a review note and a null due date', async () => {
      const rejected = {
        ...view,
        status: 'REJECTED',
        dueAt: null,
        reviewNote: 'Open orders remain.',
      };
      getMock.mockResolvedValue(rejected);

      await expect(accountDeletionApi.getLatest()).resolves.toEqual(rejected);
    });

    it('returns null when there is no request', async () => {
      getMock.mockRejectedValue(new AppApiError('NO_DELETION_REQUEST', 'None', 404));

      await expect(accountDeletionApi.getLatest()).resolves.toBeNull();
    });

    it('returns null when the raw transport error carries NO_DELETION_REQUEST', async () => {
      getMock.mockRejectedValue(httpError(404, 'NO_DELETION_REQUEST'));

      await expect(accountDeletionApi.getLatest()).resolves.toBeNull();
    });

    it('rethrows 503 ACCOUNT_DELETION_NOT_ENABLED', async () => {
      getMock.mockRejectedValue(
        new AppApiError('ACCOUNT_DELETION_NOT_ENABLED', 'Off', 503),
      );

      const error = await rejection(accountDeletionApi.getLatest());
      expect(error.code).toBe('ACCOUNT_DELETION_NOT_ENABLED');
      expect(error.status).toBe(503);
    });

    it('rethrows a 404 with another code', async () => {
      getMock.mockRejectedValue(httpError(404, 'SOMETHING_ELSE'));

      const error = await rejection(accountDeletionApi.getLatest());
      expect(error).toBeInstanceOf(AppApiError);
      expect(error.code).toBe('SOMETHING_ELSE');
    });

    it('rejects a body missing requestId', async () => {
      getMock.mockResolvedValue({...view, requestId: undefined});

      const error = await rejection(accountDeletionApi.getLatest());
      expect(error).toBeInstanceOf(AppApiError);
      expect(error.code).toBe('ACCOUNT_DELETION_INVALID_RESPONSE');
    });

    it('rejects an unknown status', async () => {
      getMock.mockResolvedValue({...view, status: 'EXPLODED'});

      const error = await rejection(accountDeletionApi.getLatest());
      expect(error.code).toBe('ACCOUNT_DELETION_INVALID_RESPONSE');
    });
  });

  describe('request', () => {
    it('posts the scope from the app and returns the view', async () => {
      postMock.mockResolvedValue(view);

      await expect(accountDeletionApi.request('CHEF')).resolves.toEqual(view);
      expect(postMock).toHaveBeenCalledWith(ACCOUNT_DELETION_PATH, {
        scope: 'CHEF',
        via: 'APP',
      });
    });

    it('rejects an invalid body', async () => {
      postMock.mockResolvedValue({...view, scope: 'EVERYTHING'});

      const error = await rejection(accountDeletionApi.request('ALL'));
      expect(error.code).toBe('ACCOUNT_DELETION_INVALID_RESPONSE');
    });

    it('normalizes a transport error', async () => {
      postMock.mockRejectedValue(httpError(409, 'DELETION_ALREADY_OPEN'));

      const error = await rejection(accountDeletionApi.request('ALL'));
      expect(error).toBeInstanceOf(AppApiError);
      expect(error.code).toBe('DELETION_ALREADY_OPEN');
    });
  });

  describe('keep', () => {
    it('sends DELETE and returns the cancelled view', async () => {
      const cancelled = {...view, status: 'CANCELLED', dueAt: null};
      deleteMock.mockResolvedValue(cancelled);

      await expect(accountDeletionApi.keep()).resolves.toEqual(cancelled);
      expect(deleteMock).toHaveBeenCalledWith(ACCOUNT_DELETION_PATH);
    });

    it('rejects an invalid body', async () => {
      deleteMock.mockResolvedValue({});

      const error = await rejection(accountDeletionApi.keep());
      expect(error.code).toBe('ACCOUNT_DELETION_INVALID_RESPONSE');
    });
  });
});
