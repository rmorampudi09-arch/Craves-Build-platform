import axios from 'axios';
import {getRuntimeConfig} from '../../../core/config/runtimeConfig';
import {createCorrelationId} from '../../../core/http/correlation';
import {apiClient} from '../../../core/http/apiClient';
import {refreshTokenStore} from '../../../core/security/refreshTokenStore';
import type {AuthTokenResponse, Identity} from '../domain/types';

const authPath = '/api/v1/auth';

export const authApi = {
  async exchangeFirebaseToken(firebaseIdToken: string): Promise<AuthTokenResponse> {
    const response = await axios.post<AuthTokenResponse>(
      `${getRuntimeConfig().apiBaseUrl}${authPath}/firebase/exchange`,
      {firebaseIdToken},
      {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': createCorrelationId(),
        },
      },
    );
    return response.data;
  },
  async me(): Promise<Identity> {
    const response = await apiClient.get<{identity: Identity}>(`${authPath}/me`);
    return response.data.identity;
  },
  async logout(): Promise<void> {
    const refreshToken = await refreshTokenStore.get();
    if (!refreshToken) {
      return;
    }
    await axios.post(
      `${getRuntimeConfig().apiBaseUrl}${authPath}/logout`,
      {refreshToken},
      {
        timeout: 8000,
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': createCorrelationId(),
        },
      },
    );
  },
};
