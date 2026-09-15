import axios, {
  CanceledError,
  type AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';
import {getRetryDelayMs, shouldRetryRequest} from './requestPolicy';

export type RetriableRequestConfig = InternalAxiosRequestConfig & {
  _cravesRetryCount?: number;
};

type RequestSignal = InternalAxiosRequestConfig['signal'];

export function waitForRetry(
  delayMs: number,
  signal?: RequestSignal,
): Promise<boolean> {
  const boundedDelayMs = Math.max(0, Math.floor(delayMs));
  if (signal?.aborted) {
    return Promise.resolve(false);
  }

  return new Promise(resolve => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    const finish = (elapsed: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      signal?.removeEventListener?.('abort', onAbort);
      resolve(elapsed);
    };

    const onAbort = () => finish(false);
    timer = setTimeout(() => finish(!signal?.aborted), boundedDelayMs);
    signal?.addEventListener?.('abort', onAbort, {once: true});

    if (signal?.aborted) {
      finish(false);
    }
  });
}

export function installSafeReadRetryInterceptor(client: AxiosInstance): number {
  return client.interceptors.response.use(
    response => response,
    async (error: unknown) => {
      if (!axios.isAxiosError(error)) {
        return Promise.reject(error);
      }

      const axiosError = error as AxiosError<unknown>;
      const original = axiosError.config as RetriableRequestConfig | undefined;
      const retryCount = original?._cravesRetryCount ?? 0;
      const cancelled = Boolean(
        axiosError.code === 'ERR_CANCELED' ||
          axios.isCancel(axiosError) ||
          original?.signal?.aborted,
      );

      if (
        !original ||
        !shouldRetryRequest({
          method: original.method,
          status: axiosError.response?.status,
          errorCode: axiosError.code,
          retryCount,
          cancelled,
        })
      ) {
        return Promise.reject(error);
      }

      original._cravesRetryCount = retryCount + 1;
      const retryDelayElapsed = await waitForRetry(
        getRetryDelayMs(retryCount),
        original.signal,
      );

      if (!retryDelayElapsed || original.signal?.aborted) {
        throw new CanceledError('Request cancelled.', original);
      }

      return client.request(original);
    },
  );
}
