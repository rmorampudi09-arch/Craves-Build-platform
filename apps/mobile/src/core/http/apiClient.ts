import {
  CanceledError,
  type AxiosError,
} from 'axios';
import {tokenMemory} from '../security/tokenMemory';
import {sessionManager} from '../../features/auth/api/sessionManager';
import {toAppApiError} from './apiError';
import {createCoreAxiosClient} from './transport';
import {
  installSafeReadRetryInterceptor,
  type RetriableRequestConfig,
} from './requestRetry';

type AuthRetriableConfig = RetriableRequestConfig & {
  _cravesAuthRetried?: boolean;
};

export const apiClient = createCoreAxiosClient(() => tokenMemory.get());

apiClient.interceptors.response.use(
  response => response,
  async (error: AxiosError<unknown>) => {
    const original = error.config as AuthRetriableConfig | undefined;
    const status = error.response?.status;

    if (status === 401 && original && !original._cravesAuthRetried) {
      original._cravesAuthRetried = true;
      try {
        const refreshed = await sessionManager.refresh();
        if (refreshed) {
          if (original.signal?.aborted) {
            throw new CanceledError('Request cancelled.', original);
          }
          original.headers.set('Authorization', `Bearer ${refreshed.accessToken}`);
          return apiClient.request(original);
        }
      } catch (refreshError) {
        if (refreshError instanceof CanceledError) {
          throw refreshError;
        }
        // Session manager owns credential clearing; surface the original safe 401 below.
      }
    }

    return Promise.reject(error);
  },
);

installSafeReadRetryInterceptor(apiClient);

/** A fresh access token after a refresh, or null when signed out or offline. Features use it instead of features/auth. */
export async function refreshAccessToken(): Promise<string | null> {
  try {
    return (await sessionManager.refresh())?.accessToken ?? null;
  } catch {
    return null;
  }
}

apiClient.interceptors.response.use(
  response => response,
  error => {
    throw toAppApiError(error);
  },
);
