import {AppApiError} from '../../core/http/apiError';
import {httpClient} from '../../core/http/httpClient';
import {
  CustomerAddressesContractError,
  customerAddressesApi,
  parseLocationSearchResponse,
} from './api/customerAddressesApi';
import {
  DEFAULT_RETRY_AFTER_SECONDS,
  classifyLocationLookupError,
} from './domain/locationLookup';

jest.mock('../../core/http/httpClient', () => ({
  httpClient: {post: jest.fn()},
}));

const post = httpClient.post as jest.Mock;

const madhapur = {
  id: 'ola-platform:5000039498427',
  title: 'Madhapur',
  subtitle: 'Hyderabad, Telangana, India',
  formattedAddress: 'Madhapur, Hyderabad, Telangana, India',
  latitude: 17.4483,
  longitude: 78.3915,
  houseNumber: null,
  street: null,
  area: null,
  district: null,
  city: null,
  state: null,
  postalCode: null,
};

describe('Ola location search contract', () => {
  beforeEach(() => post.mockReset());

  it('reads title, subtitle and the point, ignoring fields added later', () => {
    expect(
      parseLocationSearchResponse({results: [{...madhapur, rank: 1}], nextPage: null}),
    ).toEqual([
      {
        id: 'ola-platform:5000039498427',
        title: 'Madhapur',
        subtitle: 'Hyderabad, Telangana, India',
        latitude: 17.4483,
        longitude: 78.3915,
      },
    ]);
  });

  it('keeps a missing subtitle as null and drops suggestions without a usable point', () => {
    const parsed = parseLocationSearchResponse({
      results: [
        {...madhapur, subtitle: null},
        {...madhapur, latitude: 120},
        {...madhapur, title: ''},
      ],
    });
    expect(parsed).toHaveLength(1);
    expect(parsed[0].subtitle).toBeNull();
  });

  it('shows at most six suggestions and treats no matches as an empty list', () => {
    expect(
      parseLocationSearchResponse({results: Array.from({length: 9}, () => madhapur)}),
    ).toHaveLength(6);
    expect(parseLocationSearchResponse({results: []})).toEqual([]);
  });

  it('rejects a body without a results list', () => {
    expect(() => parseLocationSearchResponse({items: []})).toThrow(
      CustomerAddressesContractError,
    );
  });

  it('sends the bias point whole or not at all', async () => {
    post.mockResolvedValue({results: []});

    await customerAddressesApi.searchLocations('Madhapur', {latitude: 17.4, longitude: 78.4});
    await customerAddressesApi.searchLocations('Madhapur', null);

    expect(post.mock.calls[0][0]).toBe('/api/v1/customer/addresses/location-search');
    expect(post.mock.calls[0][1]).toEqual({query: 'Madhapur', latitude: 17.4, longitude: 78.4});
    expect(post.mock.calls[1][1]).toEqual({query: 'Madhapur'});
  });
});

describe('location lookup failures', () => {
  const now = 1_000_000;
  const failure = (status: number, retryAfterSeconds?: number) =>
    new AppApiError('X', 'message', status, undefined, false, false, [], retryAfterSeconds);

  it('waits the Retry-After seconds after a 429, or a full minute without one', () => {
    expect(classifyLocationLookupError(failure(429, 7), now)).toEqual({
      kind: 'limited',
      retryAt: now + 7000,
    });
    expect(classifyLocationLookupError(failure(429), now)).toEqual({
      kind: 'limited',
      retryAt: now + DEFAULT_RETRY_AFTER_SECONDS * 1000,
    });
  });

  it('maps 503 to unavailable, cancellation to cancelled and the rest to a message', () => {
    expect(classifyLocationLookupError(failure(503), now)).toEqual({kind: 'unavailable'});
    expect(
      classifyLocationLookupError(
        new AppApiError('REQUEST_CANCELLED', 'Request cancelled.', undefined, undefined, false, true),
        now,
      ),
    ).toEqual({kind: 'cancelled'});
    expect(classifyLocationLookupError(failure(400), now)).toEqual({
      kind: 'failed',
      message: 'message',
    });
  });
});
