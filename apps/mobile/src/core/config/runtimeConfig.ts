import Config from 'react-native-config';

export interface RuntimeConfig {
  apiBaseUrl: string;
}

export class RuntimeConfigurationError extends Error {
  readonly code = 'MOBILE_RUNTIME_CONFIG_MISSING';
}

export function getRuntimeConfig(): RuntimeConfig {
  const apiBaseUrl = Config.CRAVES_API_BASE_URL?.trim().replace(/\/+$/, '');
  if (!apiBaseUrl) {
    throw new RuntimeConfigurationError(
      'CRAVES_API_BASE_URL is not configured for this Android build.',
    );
  }
  return {apiBaseUrl};
}
