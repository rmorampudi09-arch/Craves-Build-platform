export const httpPolicy = {
  defaultTimeoutMs: 12000,
  maxRetries: 1,
  retryBaseDelayMs: 250,
  retryMaxDelayMs: 1000,
} as const;

const retryableMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
const retryableStatuses = new Set([408, 429, 500, 502, 503, 504]);
const retryableNetworkCodes = new Set([
  'ECONNABORTED',
  'ECONNRESET',
  'ERR_NETWORK',
  'ETIMEDOUT',
]);

export interface RetryDecisionInput {
  method?: string;
  status?: number;
  errorCode?: string;
  retryCount: number;
  cancelled?: boolean;
}

export function isRetriableFailure(status?: number, errorCode?: string): boolean {
  if (typeof status === 'number') {
    return retryableStatuses.has(status);
  }
  return Boolean(errorCode && retryableNetworkCodes.has(errorCode));
}

export function shouldRetryRequest(input: RetryDecisionInput): boolean {
  if (input.cancelled || input.retryCount >= httpPolicy.maxRetries) {
    return false;
  }
  if (!input.method || !retryableMethods.has(input.method.toUpperCase())) {
    return false;
  }
  return isRetriableFailure(input.status, input.errorCode);
}

export function getRetryDelayMs(retryCount: number): number {
  const boundedRetryCount = Math.max(0, Math.floor(retryCount));
  return Math.min(
    httpPolicy.retryBaseDelayMs * 2 ** boundedRetryCount,
    httpPolicy.retryMaxDelayMs,
  );
}
