import type {AxiosError, InternalAxiosRequestConfig} from 'axios';
import {tokenMemory} from '../security/tokenMemory';
import {sessionManager} from '../../features/auth/api/sessionManager';
import {toAppApiError} from './apiError';
import {createCoreAxiosClient} from './transport';
import {getRetryDelayMs, shouldRetryRequest} from './requestPolicy';

type RetriableConfig = InternalAxiosRequestConfig & {
  _cravesAuthRetried?: boolean;
  _cravesRetryCount?: number;
};

function waitForRetry(delayMs: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, delayMs));
}

export const apiClient = createCoreAxiosClient(() => tokenMemory.get());

apiClient.interceptors.response.use(
  response => response,
  async (error: AxiosError<unknown>) => {
    const original = error.config as RetriableConfig | undefined;
    const status = error.response?.status;

    if (status === 401 && original && !original._cravesAuthRetried) {
      original._cravesAuthRetried = true;
      try {
        const refreshed = await sessionManager.refresh();
        if (refreshed) {
          original.headers.set('Authorization', `Bearer ${refreshed.accessToken}`);
          return apiClient.request(original);
        }
      } catch {
        // Session manager owns credential clearing; surface the original safe 401 below.
      }
      throw toAppApiError(error);
    }

    const retryCount = original?._cravesRetryCount ?? 0;
    const cancelled = error.code === 'ERR_CANCELED';
    if (
      original &&
      shouldRetryRequest({
        method: original.method,
        status,
        errorCode: error.code,
        retryCount,
        cancelled,
      })
    ) {
      original._cravesRetryCount = retryCount + 1;
      await waitForRetry(getRetryDelayMs(retryCount));
      return apiClient.request(original);
    }

    throw toAppApiError(error);
  },
);
