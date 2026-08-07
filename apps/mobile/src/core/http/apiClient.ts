import axios, {AxiosError, InternalAxiosRequestConfig} from 'axios';
import {getRuntimeConfig} from '../config/runtimeConfig';
import {tokenMemory} from '../security/tokenMemory';
import {createCorrelationId} from './correlation';
import {sessionManager} from '../../features/auth/api/sessionManager';

type RetriableConfig = InternalAxiosRequestConfig & {_cravesRetried?: boolean};

export const apiClient = axios.create({timeout: 12000});

apiClient.interceptors.request.use(config => {
  config.baseURL = getRuntimeConfig().apiBaseUrl;
  config.headers.set('X-Correlation-ID', createCorrelationId());
  const token = tokenMemory.get();
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

apiClient.interceptors.response.use(
  response => response,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    if (error.response?.status !== 401 || !original || original._cravesRetried) {
      throw error;
    }
    original._cravesRetried = true;
    const refreshed = await sessionManager.refresh();
    if (!refreshed) {
      throw error;
    }
    original.headers.set('Authorization', `Bearer ${refreshed.accessToken}`);
    return apiClient.request(original);
  },
);
