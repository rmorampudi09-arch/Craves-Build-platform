import {
  CanceledError,
  type AxiosError,
} from 'axios';
import {tokenMemory} from '../security/tokenMemory';
import {sessionManager} from '../../features/auth/api/sessionManager';
import {toAppApiError} from './apiError';
import {isBodyLess403} from './routeAvailability';
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
    const sentBearer = original?.headers?.get('Authorization');
    // Order, catalog, subscription and notification services answer an expired bearer with an empty 403.
    const authRejected =
      status === 401 || (status === 403 && Boolean(sentBearer) && isBodyLess403(error));

    if (authRejected && original && !original._cravesAuthRetried) {
      original._cravesAuthRetried = true;
      try {
        const current = tokenMemory.get();
        // Another request may have renewed the token since this one was sent; reuse it.
        const accessToken =
          current && sentBearer !== `Bearer ${current}`
            ? current
            : (await sessionManager.refresh())?.accessToken;
        if (accessToken) {
          if (original.signal?.aborted) {
            throw new CanceledError('Request cancelled.', original);
          }
          original.headers.set('Authorization', `Bearer ${accessToken}`);
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

apiClient.interceptors.response.use(
  response => response,
  error => {
    throw toAppApiError(error);
  },
);
