export type ObservabilityScalar = string | number | boolean | null;
export type ObservabilityAttributes = Readonly<Record<string, ObservabilityScalar>>;

export type ObservabilityEventCategory =
  | 'screen'
  | 'action'
  | 'session'
  | 'network'
  | 'performance';

export interface ObservabilityEvent {
  category: ObservabilityEventCategory;
  name: string;
  timestamp: string;
  attributes: ObservabilityAttributes;
}

export interface ObservabilityErrorEvent {
  name: string;
  timestamp: string;
  errorType: string;
  attributes: ObservabilityAttributes;
}

export interface ObservabilitySink {
  recordEvent(event: ObservabilityEvent): void | Promise<void>;
  recordError(event: ObservabilityErrorEvent): void | Promise<void>;
}

export type PerformanceTraceOutcome = 'success' | 'failure' | 'cancelled';

const MAX_ATTRIBUTE_STRING_LENGTH = 160;
const SAFE_EVENT_NAME = /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/;
const SENSITIVE_ATTRIBUTE_KEY =
  /(password|passcode|otp|token|authorization|cookie|secret|credential|card|cvv|upi|bank|address|latitude|longitude|document|email|phone|payload|requestBody|responseBody|body)/i;

let activeSink: ObservabilitySink | null = null;

function sanitizeEventName(name: string): string {
  return SAFE_EVENT_NAME.test(name) ? name : 'invalid_event_name';
}

function sanitizeString(value: string): string {
  return value.replace(/[\r\n\t]+/g, ' ').slice(0, MAX_ATTRIBUTE_STRING_LENGTH);
}

export function sanitizeObservabilityAttributes(
  attributes: Readonly<Record<string, unknown>> = {},
): ObservabilityAttributes {
  const sanitized: Record<string, ObservabilityScalar> = {};

  Object.entries(attributes).forEach(([key, value]) => {
    if (!SAFE_EVENT_NAME.test(key) || SENSITIVE_ATTRIBUTE_KEY.test(key)) {
      return;
    }

    if (value === null || typeof value === 'boolean') {
      sanitized[key] = value;
      return;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      sanitized[key] = value;
      return;
    }

    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    }
  });

  return sanitized;
}

function deliverSafely(operation: () => void | Promise<void>): void {
  try {
    const result = operation();
    if (result && typeof result.then === 'function') {
      void result.catch(() => undefined);
    }
  } catch {
    // Observability must never alter product behavior or create a logging loop.
  }
}

function emitEvent(
  category: ObservabilityEventCategory,
  name: string,
  attributes: Readonly<Record<string, unknown>> = {},
): void {
  if (!activeSink) {
    return;
  }

  const event: ObservabilityEvent = {
    category,
    name: sanitizeEventName(name),
    timestamp: new Date().toISOString(),
    attributes: sanitizeObservabilityAttributes(attributes),
  };

  deliverSafely(() => activeSink?.recordEvent(event));
}

export function setObservabilitySink(sink: ObservabilitySink | null): void {
  activeSink = sink;
}

export function trackScreen(
  screenName: string,
  attributes?: Readonly<Record<string, unknown>>,
): void {
  emitEvent('screen', screenName, attributes);
}

export function trackAction(
  actionName: string,
  attributes?: Readonly<Record<string, unknown>>,
): void {
  emitEvent('action', actionName, attributes);
}

export function trackSessionEvent(
  eventName: string,
  attributes?: Readonly<Record<string, unknown>>,
): void {
  emitEvent('session', eventName, attributes);
}

export function trackNetworkEvent(
  eventName: string,
  attributes?: Readonly<Record<string, unknown>>,
): void {
  emitEvent('network', eventName, attributes);
}

export function captureException(
  error: unknown,
  name = 'unhandled_exception',
  attributes: Readonly<Record<string, unknown>> = {},
): void {
  if (!activeSink) {
    return;
  }

  const errorType =
    error instanceof Error && SAFE_EVENT_NAME.test(error.name)
      ? error.name
      : 'UnknownError';
  const event: ObservabilityErrorEvent = {
    name: sanitizeEventName(name),
    timestamp: new Date().toISOString(),
    errorType,
    attributes: sanitizeObservabilityAttributes(attributes),
  };

  deliverSafely(() => activeSink?.recordError(event));
}

export function startPerformanceTrace(
  traceName: string,
  attributes: Readonly<Record<string, unknown>> = {},
): {end: (outcome: PerformanceTraceOutcome, extra?: Readonly<Record<string, unknown>>) => void} {
  const startedAtMs = Date.now();
  let ended = false;

  return {
    end(outcome, extra = {}) {
      if (ended) {
        return;
      }
      ended = true;
      emitEvent('performance', traceName, {
        ...attributes,
        ...extra,
        outcome,
        durationMs: Math.max(0, Date.now() - startedAtMs),
      });
    },
  };
}
