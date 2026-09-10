import Config from 'react-native-config';

export type RuntimeEnvironment = 'development' | 'staging' | 'production';

export interface RuntimeConfig {
  apiBaseUrl: string;
  environment: RuntimeEnvironment;
}

export const CRAVES_PRODUCTION_API_ORIGIN = 'https://api.craves.in';

const API_VERSION_PREFIX = '/api/v1';
const LEGACY_PRODUCTION_API_ORIGINS = new Set([
  'https://api.example.invalid',
  'https://apim-craves-prodlow-l3ing6.azure-api.net',
]);

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

  if (!candidate && environment === 'production') {
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
  if (normalizedPath && normalizedPath !== API_VERSION_PREFIX) {
    throw new RuntimeConfigurationError(
      'CRAVES_API_BASE_URL must be the gateway origin only; mobile API paths already include /api/v1.',
    );
  }

  const configuredOrigin = `${parsed.protocol}//${parsed.host}`;
  const resolvedOrigin =
    environment === 'production' &&
    LEGACY_PRODUCTION_API_ORIGINS.has(configuredOrigin)
      ? CRAVES_PRODUCTION_API_ORIGIN
      : configuredOrigin;

  return resolvedOrigin;
}

export function getRuntimeConfig(): RuntimeConfig {
  const environment = resolveEnvironment(Config.CRAVES_ENVIRONMENT);
  const apiBaseUrl = resolveApiBaseUrl(
    Config.CRAVES_API_BASE_URL,
    environment,
  );

  return {apiBaseUrl, environment};
}
