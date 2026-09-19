import {httpClient} from '../../../core/http/httpClient';
import {
  buildCreateScheduleRequest,
  parseScheduleCapability,
  parseScheduleRequest,
  scheduledOrdersApi,
} from './scheduledOrdersApi';

jest.mock('../../../core/http/httpClient', () => ({
  httpClient: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
}));

const checkoutId = '11111111-1111-4111-8111-111111111111';
const scheduleRequestId = '22222222-2222-4222-8222-222222222222';
const orderId = '33333333-3333-4333-8333-333333333333';
const kitchenId = '44444444-4444-4444-8444-444444444444';

const capability = {
  checkoutId,
  supported: true,
  effectiveMinLeadMinutes: 60,
  effectiveMaxHorizonMinutes: 1440,
  paymentGate: 'PAYMENT_AFTER_ALL_CHEFS_CONFIRM',
  blockers: [],
};

const schedule = {
  scheduleRequestId,
  checkoutId,
  requestedFulfilmentAt: '2099-09-20T13:30:00Z',
  requestedTimezone: 'Asia/Kolkata',
  status: 'PENDING_CHEF_CONFIRMATION',
  version: 1,
  kitchens: [
    {
      orderId,
      kitchenId,
      status: 'PENDING',
      paymentGate: 'PAYMENT_AFTER_ALL_CHEFS_CONFIRM',
      responseNote: null,
      version: 1,
      respondedAt: null,
    },
  ],
  createdAt: '2099-09-19T13:00:00Z',
  updatedAt: '2099-09-19T13:00:00Z',
};

describe('scheduledOrdersApi customer contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts the exact capability JSON and rejects extra fields', () => {
    expect(parseScheduleCapability(capability)).toEqual(capability);
    expect(
      parseScheduleCapability({...capability, slotMinutes: 30}),
    ).toBeNull();
  });

  it('requires complete supported capability evidence', () => {
    expect(
      parseScheduleCapability({
        ...capability,
        effectiveMinLeadMinutes: null,
      }),
    ).toBeNull();
    expect(
      parseScheduleCapability({
        ...capability,
        blockers: ['SCHEDULE_POLICY_NOT_ACTIVE'],
      }),
    ).toBeNull();
  });

  it('accepts the exact schedule JSON and rejects leaked or inconsistent fields', () => {
    expect(parseScheduleRequest(schedule)).toEqual(schedule);
    expect(
      parseScheduleRequest({...schedule, customerPhone: '+919999999999'}),
    ).toBeNull();
    expect(
      parseScheduleRequest({
        ...schedule,
        kitchens: [
          {
            ...schedule.kitchens[0],
            status: 'ACCEPTED',
            respondedAt: null,
          },
        ],
      }),
    ).toBeNull();
  });

  it('builds only requestedFulfilmentAt and canonical timezone input fields', () => {
    expect(
      buildCreateScheduleRequest({
        requestedFulfilmentAt: '2099-09-20T13:30:00Z',
        requestedTimezone: ' Asia/Kolkata ',
      }),
    ).toEqual({
      requestedFulfilmentAt: '2099-09-20T13:30:00Z',
      requestedTimezone: 'Asia/Kolkata',
    });
  });

  it('rejects past times and invalid timezones before POST', () => {
    expect(() =>
      buildCreateScheduleRequest({
        requestedFulfilmentAt: '2020-01-01T00:00:00Z',
        requestedTimezone: 'Asia/Kolkata',
      }),
    ).toThrow('SCHEDULE_TIME_NOT_FUTURE');

    expect(() =>
      buildCreateScheduleRequest({
        requestedFulfilmentAt: '2099-09-20T13:30:00Z',
        requestedTimezone: 'Not/A_Timezone',
      }),
    ).toThrow('SCHEDULE_TIMEZONE_INVALID');
  });

  it('reads the exact checkout schedule capability route', async () => {
    (httpClient.get as jest.Mock).mockResolvedValue(capability);

    await expect(
      scheduledOrdersApi.getCapability(checkoutId),
    ).resolves.toEqual(capability);

    expect(httpClient.get).toHaveBeenCalledWith(
      `/api/v1/checkouts/${checkoutId}/schedule/capability`,
      {
        signal: undefined,
        dedupeKey: `scheduled-order-capability:${checkoutId}`,
      },
    );
  });

  it('posts the exact schedule JSON with Idempotency-Key', async () => {
    (httpClient.post as jest.Mock).mockResolvedValue(schedule);

    await expect(
      scheduledOrdersApi.create(
        checkoutId,
        ' schedule-key-123 ',
        {
          requestedFulfilmentAt: '2099-09-20T13:30:00Z',
          requestedTimezone: 'Asia/Kolkata',
        },
      ),
    ).resolves.toEqual(schedule);

    expect(httpClient.post).toHaveBeenCalledWith(
      `/api/v1/checkouts/${checkoutId}/schedule`,
      {
        requestedFulfilmentAt: '2099-09-20T13:30:00Z',
        requestedTimezone: 'Asia/Kolkata',
      },
      {
        signal: undefined,
        headers: {'Idempotency-Key': 'schedule-key-123'},
      },
    );
  });

  it('reads and withdraws only the exact checkout schedule resource', async () => {
    (httpClient.get as jest.Mock).mockResolvedValue(schedule);
    (httpClient.delete as jest.Mock).mockResolvedValue({
      ...schedule,
      status: 'CANCELLED',
      version: 2,
      updatedAt: '2099-09-19T13:05:00Z',
    });

    await expect(scheduledOrdersApi.get(checkoutId)).resolves.toEqual(schedule);
    await expect(scheduledOrdersApi.withdraw(checkoutId)).resolves.toMatchObject({
      checkoutId,
      status: 'CANCELLED',
      version: 2,
    });

    expect(httpClient.get).toHaveBeenCalledWith(
      `/api/v1/checkouts/${checkoutId}/schedule`,
      {
        signal: undefined,
        dedupeKey: `scheduled-order:${checkoutId}`,
      },
    );
    expect(httpClient.delete).toHaveBeenCalledWith(
      `/api/v1/checkouts/${checkoutId}/schedule`,
      {signal: undefined},
    );
  });

  it('rejects a response for a different checkout id', async () => {
    (httpClient.get as jest.Mock).mockResolvedValue({
      ...capability,
      checkoutId: '55555555-5555-4555-8555-555555555555',
    });

    await expect(
      scheduledOrdersApi.getCapability(checkoutId),
    ).rejects.toThrow('SCHEDULE_CAPABILITY_INVALID_RESPONSE');
  });

  it('rejects invalid checkout ids and short idempotency keys before network calls', async () => {
    await expect(
      scheduledOrdersApi.getCapability('not-a-uuid'),
    ).rejects.toThrow('SCHEDULE_CHECKOUT_ID_INVALID');

    await expect(
      scheduledOrdersApi.create(
        checkoutId,
        'short',
        {
          requestedFulfilmentAt: '2099-09-20T13:30:00Z',
          requestedTimezone: 'Asia/Kolkata',
        },
      ),
    ).rejects.toThrow('SCHEDULE_IDEMPOTENCY_KEY_INVALID');

    expect(httpClient.get).not.toHaveBeenCalled();
    expect(httpClient.post).not.toHaveBeenCalled();
  });
});
