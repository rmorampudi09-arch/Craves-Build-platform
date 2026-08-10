import Config from 'react-native-config';

export type RuntimeEnvironment = 'development' | 'staging' | 'production';

export interface RuntimeConfig {
  apiBaseUrl: string;
  environment: RuntimeEnvironment;
}

export const CRAVES_PRODUCTION_API_ORIGIN =
  'https://apim-craves-prodlow-l3ing6.azure-api.net';

const API_VERSION_PREFIX = '/api/v1';
const LEGACY_PLACEHOLDER_API_BASE_URL = 'https://api.example.invalid';

export class RuntimeConfigurationError extends Error {
  readonly code = 'MOBILE_RUNTIME_CONFIG_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'RuntimeConfigurationError';
  }
}

function resolveEnvironment(value: string | undefined): RuntimeEnvironment {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return __DEV__ ? 'development' : 'production';
  }

  if (
    normalized !== 'development' &&
    normalized !== 'staging' &&
    normalized !== 'production'
  ) {
    throw new RuntimeConfigurationError(
      'CRAVES_ENVIRONMENT must be development, staging, or production.',
    );
  }

  // A non-debug Android binary must never inherit a stale local-development
  // environment from a copied .env file. Staging remains an explicit opt-in.
  if (!__DEV__ && normalized === 'development') {
    return 'production';
  }

  return normalized;
}

function resolveApiBaseUrl(
  value: string | undefined,
  environment: RuntimeEnvironment,
): string {
  let candidate = value?.trim().replace(/\/+$/, '');

  // Production has one public mobile gateway. Keep a safe fallback so a
  // release build cannot become unusable merely because an ignored .env file
  // was absent, or because the old checked-in placeholder was copied locally.
  if (
    environment === 'production' &&
    (!candidate || candidate === LEGACY_PLACEHOLDER_API_BASE_URL)
  ) {
    candidate = CRAVES_PRODUCTION_API_ORIGIN;
  }

  if (!candidate) {
    throw new RuntimeConfigurationError(
      'CRAVES_API_BASE_URL is not configured for this Android build.',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new RuntimeConfigurationError(
      'CRAVES_API_BASE_URL must be a valid absolute HTTP(S) URL.',
    );
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new RuntimeConfigurationError(
      'CRAVES_API_BASE_URL must use HTTP or HTTPS.',
    );
  }

  if (environment !== 'development' && parsed.protocol !== 'https:') {
    throw new RuntimeConfigurationError(
      'CRAVES_API_BASE_URL must use HTTPS outside development.',
    );
  }

  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new RuntimeConfigurationError(
      'CRAVES_API_BASE_URL must not contain credentials, query parameters, or fragments.',
    );
  }

  const normalizedPath = parsed.pathname.replace(/\/+$/, '');

  // Every production client action already carries its published /api/v1
  // route. Accept and normalize the previously supplied full API base to avoid
  // producing /api/v1/api/v1/... requests after Firebase OTP verification.
  if (normalizedPath === API_VERSION_PREFIX) {
    parsed.pathname = '/';
  } else if (normalizedPath) {
    throw new RuntimeConfigurationError(
      'CRAVES_API_BASE_URL must be the gateway origin only; mobile API paths already include /api/v1.',
    );
  }

  return parsed.toString().replace(/\/+$/, '');
}

export function getRuntimeConfig(): RuntimeConfig {
  const environment = resolveEnvironment(Config.CRAVES_ENVIRONMENT);
  const apiBaseUrl = resolveApiBaseUrl(
    Config.CRAVES_API_BASE_URL,
    environment,
  );

  return {apiBaseUrl, environment};
}
