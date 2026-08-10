import axios, {type AxiosInstance} from 'axios';
import {getRuntimeConfig} from '../config/runtimeConfig';
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

  client.interceptors.request.use(config =>
    applyRequestMetadata(config, {
      baseUrl: getRuntimeConfig().apiBaseUrl,
      correlationId: createCorrelationId(),
      injectBearer: Boolean(accessTokenProvider),
      accessToken: accessTokenProvider?.(),
    }),
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
