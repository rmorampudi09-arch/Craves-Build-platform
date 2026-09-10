import type {InternalAxiosRequestConfig} from 'axios';

export interface RequestMetadata {
  baseUrl: string;
  correlationId: string;
  injectBearer: boolean;
  accessToken?: string | null;
}

export function applyRequestMetadata(
  config: InternalAxiosRequestConfig,
  metadata: RequestMetadata,
): InternalAxiosRequestConfig {
  config.baseURL = metadata.baseUrl;

  if (!config.headers.has('X-Correlation-ID')) {
    config.headers.set('X-Correlation-ID', metadata.correlationId);
  }

  if (metadata.injectBearer) {
    if (metadata.accessToken) {
      config.headers.set('Authorization', `Bearer ${metadata.accessToken}`);
    } else {
      config.headers.delete('Authorization');
    }
  }

  return config;
}
