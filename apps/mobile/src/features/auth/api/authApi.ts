import {httpClient} from '../../../core/http/httpClient';
import {publicApiClient} from '../../../core/http/transport';
import {refreshTokenStore} from '../../../core/security/refreshTokenStore';
import type {AuthTokenResponse, Identity} from '../domain/types';

const authPath = '/api/v1/auth';

export const authApi = {
  async exchangeFirebaseToken(firebaseIdToken: string): Promise<AuthTokenResponse> {
    const response = await publicApiClient.post<AuthTokenResponse>(
      `${authPath}/firebase/exchange`,
      {firebaseIdToken},
      {timeout: 10000},
    );
    return response.data;
  },
  async me(): Promise<Identity> {
    const response = await httpClient.get<{identity: Identity}>(`${authPath}/me`);
    return response.identity;
  },
  async logout(): Promise<void> {
    const refreshToken = await refreshTokenStore.get();
    if (!refreshToken) {
      return;
    }
    await publicApiClient.post(
      `${authPath}/logout`,
      {refreshToken},
      {timeout: 8000},
    );
  },
};
