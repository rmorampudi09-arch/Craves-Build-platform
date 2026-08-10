import type {InternalAxiosRequestConfig} from 'axios';
import {
  startPerformanceTrace,
  trackNetworkEvent,
  type PerformanceTraceOutcome,
} from './observability';

interface ActiveObservation {
  correlationId: string;
  method: string;
  route: string;
  trace: ReturnType<typeof startPerformanceTrace>;
}

const activeRequests = new WeakMap<object, ActiveObservation>();

function normalizeSegment(segment: string): string {
  if (/^\d+$/.test(segment)) return ':id';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(segment)) {
    return ':id';
  }
  if (segment.includes('@') || segment.length > 40) return ':id';
  return segment;
}

export function sanitizeNetworkRoute(url?: string): string {
  if (!url) return 'unknown';
  return url
    .split('?')[0]
    .split('#')[0]
    .split('/')
    .map(normalizeSegment)
    .join('/')
    .slice(0, 160);
}

function correlationIdFrom(config: InternalAxiosRequestConfig): string {
  const value = config.headers.get('X-Correlation-ID');
  return typeof value === 'string' && value.length <= 128 ? value : 'unavailable';
}

export function beginNetworkObservation(config: InternalAxiosRequestConfig): void {
  const method = (config.method ?? 'UNKNOWN').toUpperCase();
  const route = sanitizeNetworkRoute(config.url);
  const correlationId = correlationIdFrom(config);
  const trace = startPerformanceTrace('http_request', {method, route});

  activeRequests.set(config, {correlationId, method, route, trace});
  trackNetworkEvent('http_request_started', {method, route, correlationId});
}

export function endNetworkObservation(
  config: InternalAxiosRequestConfig | undefined,
  outcome: PerformanceTraceOutcome,
  status?: number,
): void {
  if (!config) return;
  const observation = activeRequests.get(config);
  if (!observation) return;
  activeRequests.delete(config);

  observation.trace.end(outcome, {
    correlationId: observation.correlationId,
    status: status ?? null,
  });
  trackNetworkEvent('http_request_finished', {
    method: observation.method,
    route: observation.route,
    correlationId: observation.correlationId,
    status: status ?? null,
    outcome,
  });
}
