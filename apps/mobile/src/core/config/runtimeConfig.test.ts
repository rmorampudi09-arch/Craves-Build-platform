import Config from 'react-native-config';
import {
  getRuntimeConfig,
  RuntimeConfigurationError,
} from './runtimeConfig';

type MutableRuntimeEnvironment = {
  CRAVES_API_BASE_URL?: string;
  CRAVES_ENVIRONMENT?: string;
};

const mutableConfig = Config as MutableRuntimeEnvironment;
const originalApiBaseUrl = mutableConfig.CRAVES_API_BASE_URL;
const originalEnvironment = mutableConfig.CRAVES_ENVIRONMENT;

afterEach(() => {
  mutableConfig.CRAVES_API_BASE_URL = originalApiBaseUrl;
  mutableConfig.CRAVES_ENVIRONMENT = originalEnvironment;
});

describe('getRuntimeConfig', () => {
  it('normalizes the API base URL and resolves an explicit environment', () => {
    mutableConfig.CRAVES_ENVIRONMENT = 'staging';
    mutableConfig.CRAVES_API_BASE_URL = ' https://staging.example.invalid/ ';

    expect(getRuntimeConfig()).toEqual({
      apiBaseUrl: 'https://staging.example.invalid',
      environment: 'staging',
    });
  });

  it('fails clearly when the required API base URL is missing', () => {
    mutableConfig.CRAVES_ENVIRONMENT = 'development';
    mutableConfig.CRAVES_API_BASE_URL = '   ';

    expect(() => getRuntimeConfig()).toThrow(RuntimeConfigurationError);
    expect(() => getRuntimeConfig()).toThrow('CRAVES_API_BASE_URL');
  });

  it('rejects an unsupported environment name', () => {
    mutableConfig.CRAVES_ENVIRONMENT = 'qa';
    mutableConfig.CRAVES_API_BASE_URL = 'https://qa.example.invalid';

    expect(() => getRuntimeConfig()).toThrow('CRAVES_ENVIRONMENT');
  });

  it('requires HTTPS outside development', () => {
    mutableConfig.CRAVES_ENVIRONMENT = 'production';
    mutableConfig.CRAVES_API_BASE_URL = 'http://api.example.invalid';

    expect(() => getRuntimeConfig()).toThrow(
      'CRAVES_API_BASE_URL must use HTTPS outside development.',
    );
  });

  it('allows HTTP for local development endpoints', () => {
    mutableConfig.CRAVES_ENVIRONMENT = 'development';
    mutableConfig.CRAVES_API_BASE_URL = 'http://10.0.2.2:8080/';

    expect(getRuntimeConfig()).toEqual({
      apiBaseUrl: 'http://10.0.2.2:8080',
      environment: 'development',
    });
  });

  it('rejects credentials, query strings, and fragments in the base URL', () => {
    mutableConfig.CRAVES_ENVIRONMENT = 'production';
    mutableConfig.CRAVES_API_BASE_URL =
      'https://user:password@example.invalid?token=value#section';

    expect(() => getRuntimeConfig()).toThrow(
      'CRAVES_API_BASE_URL must not contain credentials, query parameters, or fragments.',
    );
  });
});
