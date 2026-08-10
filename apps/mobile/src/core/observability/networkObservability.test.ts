import {sanitizeNetworkRoute} from './networkObservability';

describe('network observability', () => {
  it('drops query strings and redacts dynamic identifiers', () => {
    expect(
      sanitizeNetworkRoute(
        '/api/v1/orders/12345/items/550e8400-e29b-41d4-a716-446655440000?email=private@example.com',
      ),
    ).toBe('/api/v1/orders/:id/items/:id');
  });

  it('redacts unusually long and email-like path segments', () => {
    expect(sanitizeNetworkRoute('/api/v1/profile/private@example.com')).toBe(
      '/api/v1/profile/:id',
    );
    expect(sanitizeNetworkRoute(`/api/v1/resource/${'a'.repeat(60)}`)).toBe(
      '/api/v1/resource/:id',
    );
  });
});
