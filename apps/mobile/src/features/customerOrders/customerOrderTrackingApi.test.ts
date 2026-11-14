import {httpClient} from '../../core/http/httpClient';
import {
  customerOrderTrackingApi,
  customerOrderTrackingPath,
  parseCustomerOrderTrackingResponse,
} from './api/customerOrderTrackingApi';

jest.mock('../../core/http/httpClient', () => ({
  httpClient: {
    get: jest.fn(),
  },
}));

const getMock = httpClient.get as jest.Mock;
const ORDER_ID = '11111111-1111-4111-8111-111111111111';

function tracking(overrides: Record<string, unknown> = {}) {
  return {
    orderId: ORDER_ID,
    deliveryJobId: '22222222-2222-4222-8222-222222222222',
    providerId: 'provider-neutral',
    status: 'IN_TRANSIT',
    trackingUrl: 'https://tracking.example.test/order',
    observedAt: '2026-08-08T12:10:00Z',
    rawWebhookPayload: {secret: true},
    history: [
      {
        oldStatus: 'PICKED_UP',
        newStatus: 'IN_TRANSIT',
        trackingUrl: 'https://tracking.example.test/order',
        observedAt: '2026-08-08T12:10:00Z',
        recordedAt: '2026-08-08T12:10:01Z',
      },
    ],
    ...overrides,
  };
}

describe('P55 customer delivery tracking API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('calls only the exact customer delivery-status route', async () => {
    getMock.mockResolvedValueOnce(tracking());

    await customerOrderTrackingApi.getTracking(ORDER_ID);

    expect(getMock).toHaveBeenCalledWith(customerOrderTrackingPath(ORDER_ID), {
      signal: undefined,
      dedupeKey: `customer-order-tracking:${ORDER_ID}`,
    });
  });

  it('accepts the documented owned-order pre-delivery projection', () => {
    expect(
      parseCustomerOrderTrackingResponse({
        orderId: ORDER_ID,
        deliveryJobId: null,
        providerId: null,
        status: null,
        trackingUrl: null,
        observedAt: null,
        history: [],
      }),
    ).toEqual({
      orderId: ORDER_ID,
      deliveryJobId: null,
      providerId: null,
      status: null,
      trackingUrl: null,
      observedAt: null,
      history: [],
      courierLocation: null,
      deliveryCode: null,
      routePath: null,
    });
  });

  it('reads the road route string, and ignores a bad one', () => {
    expect(parseCustomerOrderTrackingResponse(tracking({routePath: 'abc'}))?.routePath).toBe('abc');
    for (const routePath of [undefined, null, 42, 'a'.repeat(20001)]) {
      expect(parseCustomerOrderTrackingResponse(tracking({routePath}))?.routePath).toBeNull();
    }
  });

  it('reads the delivery partner position, and ignores a malformed one', () => {
    const position = {latitude: 17.49, longitude: 78.39, observedAt: '2026-10-14T09:00:00Z'};
    expect(parseCustomerOrderTrackingResponse(tracking({courierLocation: position}))?.courierLocation).toEqual(position);
    expect(
      parseCustomerOrderTrackingResponse(tracking({courierLocation: {latitude: 'x'}}))?.courierLocation,
    ).toBeNull();
  });

  it('reads the 4-digit delivery code, and treats anything else as no code', () => {
    expect(parseCustomerOrderTrackingResponse(tracking({deliveryCode: '4821'}))?.deliveryCode).toBe('4821');
    expect(parseCustomerOrderTrackingResponse(tracking({deliveryCode: '0042'}))?.deliveryCode).toBe('0042');
    expect(parseCustomerOrderTrackingResponse(tracking())?.deliveryCode).toBeNull();
    for (const deliveryCode of [null, '482', '48210', 'abcd', 4821]) {
      expect(parseCustomerOrderTrackingResponse(tracking({deliveryCode}))?.deliveryCode).toBeNull();
    }
  });

  it('strips unapproved fields and removes non-HTTPS tracking URLs', () => {
    const parsed = parseCustomerOrderTrackingResponse(
      tracking({trackingUrl: 'http://unsafe.example.test/order'}),
    );

    expect(parsed).not.toBeNull();
    expect(parsed).not.toHaveProperty('rawWebhookPayload');
    expect(parsed?.trackingUrl).toBeNull();
  });

  it('rejects unknown provider states and out-of-order history', () => {
    expect(
      parseCustomerOrderTrackingResponse(tracking({status: 'UNKNOWN'})),
    ).toBeNull();

    expect(
      parseCustomerOrderTrackingResponse(
        tracking({
          history: [
            {
              oldStatus: 'PICKED_UP',
              newStatus: 'IN_TRANSIT',
              trackingUrl: null,
              observedAt: '2026-08-08T12:10:00Z',
              recordedAt: '2026-08-08T12:10:01Z',
            },
            {
              oldStatus: 'AT_PICKUP',
              newStatus: 'PICKED_UP',
              trackingUrl: null,
              observedAt: '2026-08-08T12:00:00Z',
              recordedAt: '2026-08-08T12:00:01Z',
            },
          ],
        }),
      ),
    ).toBeNull();
  });

  it('fails closed if the tracking response order ID does not match the route', async () => {
    getMock.mockResolvedValueOnce(
      tracking({orderId: '88888888-8888-4888-8888-888888888888'}),
    );

    await expect(customerOrderTrackingApi.getTracking(ORDER_ID)).rejects.toMatchObject({
      code: 'CUSTOMER_ORDER_TRACKING_INVALID_RESPONSE',
    });
  });
});
