import {AxiosHeaders, type InternalAxiosRequestConfig} from 'axios';
import {createCorrelationId} from './correlation';
import {applyRequestMetadata} from './requestMetadata';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('backend-compatible correlation IDs', () => {
  it('generates distinct UUIDs accepted by Java UUID request headers', () => {
    const ids = Array.from({length: 100}, createCorrelationId);
    ids.forEach(id => expect(id).toMatch(UUID_V4));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('attaches a UUID without changing authentication or idempotency', () => {
    const config = {
      headers: new AxiosHeaders({'Idempotency-Key': 'chef-order-accept-revision'}),
    } as InternalAxiosRequestConfig;
    const result = applyRequestMetadata(config, {
      baseUrl: 'https://api.example.invalid',
      correlationId: createCorrelationId(),
      injectBearer: true,
      accessToken: 'test-access-token',
    });
    expect(result.headers.get('X-Correlation-ID')).toMatch(UUID_V4);
    expect(result.headers.get('Idempotency-Key')).toBe('chef-order-accept-revision');
    expect(result.headers.get('Authorization')).toBe('Bearer test-access-token');
  });
});
