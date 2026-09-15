import axios, {type AxiosError, type AxiosInstance} from 'axios';
import {getRuntimeConfig} from '../config/runtimeConfig';
import {
  beginNetworkObservation,
  endNetworkObservation,
} from '../observability/networkObservability';
import {createCorrelationId} from './correlation';
import {toAppApiError} from './apiError';
import {applyRequestMetadata} from './requestMetadata';
import {httpPolicy} from './requestPolicy';
import {installSafeReadRetryInterceptor} from './requestRetry';

type AccessTokenProvider = () => string | null;

export function createCoreAxiosClient(
  accessTokenProvider?: AccessTokenProvider,
): AxiosInstance {
  const client = axios.create({timeout: httpPolicy.defaultTimeoutMs});

  client.interceptors.request.use(config => {
    const observedConfig = applyRequestMetadata(config, {
      baseUrl: getRuntimeConfig().apiBaseUrl,
      correlationId: createCorrelationId(),
      injectBearer: Boolean(accessTokenProvider),
      accessToken: accessTokenProvider?.(),
    });
    beginNetworkObservation(observedConfig);
    return observedConfig;
  });

  client.interceptors.response.use(
    response => {
      endNetworkObservation(response.config, 'success', response.status);
      return response;
    },
    (error: AxiosError<unknown>) => {
      endNetworkObservation(
        error.config,
        error.code === 'ERR_CANCELED' ? 'cancelled' : 'failure',
        error.response?.status,
      );
      return Promise.reject(error);
    },
  );

  return client;
}

export const publicApiClient = createCoreAxiosClient();

installSafeReadRetryInterceptor(publicApiClient);

publicApiClient.interceptors.response.use(
  response => response,
  error => {
    throw toAppApiError(error);
  },
);
