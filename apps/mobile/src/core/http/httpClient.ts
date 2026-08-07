import type {AxiosRequestConfig} from 'axios';
import {apiClient} from './apiClient';
import {runDedupedRequest} from './requestDedupe';

type BaseRequestOptions = Omit<
  AxiosRequestConfig,
  'baseURL' | 'method' | 'url' | 'data'
>;

export type ReadRequestOptions = BaseRequestOptions & {
  dedupeKey?: string;
};
export type WriteRequestOptions = BaseRequestOptions;

async function read<TResponse>(
  method: 'GET' | 'HEAD',
  url: string,
  options: ReadRequestOptions = {},
): Promise<TResponse> {
  const {dedupeKey, ...config} = options;
  return runDedupedRequest(dedupeKey, async () => {
    const response = await apiClient.request<TResponse>({
      ...config,
      method,
      url,
    });
    return response.data;
  });
}

async function write<TResponse>(
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  data: unknown,
  options: WriteRequestOptions = {},
): Promise<TResponse> {
  const response = await apiClient.request<TResponse>({
    ...options,
    method,
    url,
    data,
  });
  return response.data;
}

export const httpClient = {
  get<TResponse>(url: string, options?: ReadRequestOptions): Promise<TResponse> {
    return read<TResponse>('GET', url, options);
  },
  head<TResponse>(url: string, options?: ReadRequestOptions): Promise<TResponse> {
    return read<TResponse>('HEAD', url, options);
  },
  post<TResponse>(
    url: string,
    data?: unknown,
    options?: WriteRequestOptions,
  ): Promise<TResponse> {
    return write<TResponse>('POST', url, data, options);
  },
  put<TResponse>(
    url: string,
    data?: unknown,
    options?: WriteRequestOptions,
  ): Promise<TResponse> {
    return write<TResponse>('PUT', url, data, options);
  },
  patch<TResponse>(
    url: string,
    data?: unknown,
    options?: WriteRequestOptions,
  ): Promise<TResponse> {
    return write<TResponse>('PATCH', url, data, options);
  },
  delete<TResponse>(url: string, options?: WriteRequestOptions): Promise<TResponse> {
    return write<TResponse>('DELETE', url, undefined, options);
  },
};
