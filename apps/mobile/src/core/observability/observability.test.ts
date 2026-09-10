import {
  captureException,
  sanitizeObservabilityAttributes,
  setObservabilitySink,
  startPerformanceTrace,
  trackAction,
  type ObservabilityErrorEvent,
  type ObservabilityEvent,
} from './observability';

describe('observability', () => {
  afterEach(() => {
    setObservabilitySink(null);
    jest.restoreAllMocks();
  });

  it('drops sensitive and unsupported attributes', () => {
    expect(
      sanitizeObservabilityAttributes({
        role: 'CHEF',
        status: 401,
        retriable: false,
        refreshToken: 'secret',
        authorization: 'Bearer secret',
        email: 'private@example.com',
        address: 'private address',
        nested: {id: 'not-allowed'},
      }),
    ).toEqual({role: 'CHEF', status: 401, retriable: false});
  });

  it('redacts sensitive-looking values even under a generic key', () => {
    expect(
      sanitizeObservabilityAttributes({
        reason: 'private@example.com',
        context: 'Bearer abc.def.ghi',
        destination: '+91 98765 43210',
      }),
    ).toEqual({
      reason: '[redacted]',
      context: '[redacted]',
      destination: '[redacted]',
    });
  });

  it('bounds string attributes and strips control whitespace', () => {
    const value = `a\n\tb${'x'.repeat(300)}`;
    const result = sanitizeObservabilityAttributes({safeValue: value});

    expect(result.safeValue).not.toContain('\n');
    expect(String(result.safeValue).length).toBeLessThanOrEqual(160);
  });

  it('isolates sink failures from product behavior', () => {
    setObservabilitySink({
      recordEvent() {
        throw new Error('provider unavailable');
      },
      recordError() {
        throw new Error('provider unavailable');
      },
    });

    expect(() => trackAction('cart_add_attempt', {source: 'dish_detail'})).not.toThrow();
    expect(() => captureException(new Error('private message'))).not.toThrow();
  });

  it('never exports raw error messages', () => {
    const errors: ObservabilityErrorEvent[] = [];
    setObservabilitySink({
      recordEvent() {},
      recordError(event) {
        errors.push(event);
      },
    });

    captureException(new TypeError('contains private@example.com and token abc'));

    expect(errors).toHaveLength(1);
    expect(errors[0].errorType).toBe('TypeError');
    expect(JSON.stringify(errors[0])).not.toContain('private@example.com');
    expect(JSON.stringify(errors[0])).not.toContain('token abc');
  });

  it('records a performance trace once with duration and outcome', () => {
    const events: ObservabilityEvent[] = [];
    setObservabilitySink({
      recordEvent(event) {
        events.push(event);
      },
      recordError() {},
    });
    jest.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1035);

    const trace = startPerformanceTrace('session_refresh', {source: 'silent'});
    trace.end('success');
    trace.end('failure');

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      category: 'performance',
      name: 'session_refresh',
      attributes: {source: 'silent', outcome: 'success', durationMs: 35},
    });
  });
});
