// Test helper (no app code imports it): answers every apiClient and publicApiClient call from a handler instead of
// the network, keeping the real interceptors (token refresh on 401, read retries, AppApiError mapping).
import {AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig} from 'axios';
import {apiClient} from '../../../core/http/apiClient';
import {publicApiClient} from '../../../core/http/transport';

export interface FakeReply {
  status: number;
  data?: unknown;
  headers?: Record<string, string>;
}

/** Return a reply, or throw (e.g. an AxiosError with code ERR_NETWORK) to fail like the network. */
export type FakeHandler = (config: InternalAxiosRequestConfig) => FakeReply | Promise<FakeReply>;

/** Routes both clients to the handler and returns the list of requests they made, in order. */
export function fakeHttp(handler: FakeHandler): InternalAxiosRequestConfig[] {
  const calls: InternalAxiosRequestConfig[] = [];
  const adapter: AxiosAdapter = async config => {
    calls.push(config);
    const reply = await handler(config);
    const response = {
      data: reply.data ?? '',
      status: reply.status,
      statusText: String(reply.status),
      headers: reply.headers ?? {},
      config,
    };
    if (!config.validateStatus || config.validateStatus(reply.status)) {
      return response;
    }
    throw new AxiosError(
      `Request failed with status code ${reply.status}`,
      reply.status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
      config,
      null,
      response,
    );
  };
  apiClient.defaults.adapter = adapter;
  publicApiClient.defaults.adapter = adapter;
  return calls;
}
