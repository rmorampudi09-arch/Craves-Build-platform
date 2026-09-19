import {httpClient} from '../../../core/http/httpClient';
import {
  CHEF_KITCHEN_SCHEDULE_PATH,
  chefKitchenScheduleApi,
  normalizeChefKitchenScheduleUpdate,
  scheduleUpdateFromCurrent,
} from './chefKitchenScheduleApi';

jest.mock('../../../core/http/httpClient', () => ({
  httpClient: {
    get: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

const schedule = {
  kitchenId: '11111111-1111-4111-8111-111111111111',
  timezoneId: 'Asia/Kolkata',
  acceptingOrders: true,
  pausedUntil: null,
  pauseReason: null,
  weeklyWindows: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      dayOfWeek: 1,
      opensAt: '09:00:00',
      closesAt: '14:00:00',
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      dayOfWeek: 1,
      opensAt: '18:00:00',
      closesAt: '21:00:00',
    },
  ],
};

describe('chefKitchenScheduleApi contract', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('reads the exact owned schedule route', async () => {
    (httpClient.get as jest.Mock).mockResolvedValueOnce(schedule);

    await expect(chefKitchenScheduleApi.get()).resolves.toEqual(schedule);

    expect(httpClient.get).toHaveBeenCalledWith(CHEF_KITCHEN_SCHEDULE_PATH, {
      signal: undefined,
      dedupeKey: 'chef-kitchen-schedule',
    });
  });

  it('preserves all weekly windows when changing operational controls', () => {
    expect(
      scheduleUpdateFromCurrent(schedule, {
        acceptingOrders: true,
        pausedUntil: '2026-09-20T03:00:00Z',
        pauseReason: 'Kitchen break',
      }),
    ).toEqual({
      acceptingOrders: true,
      pausedUntil: '2026-09-20T03:00:00Z',
      pauseReason: 'Kitchen break',
      weeklyWindows: [
        {dayOfWeek: 1, opensAt: '09:00:00', closesAt: '14:00:00'},
        {dayOfWeek: 1, opensAt: '18:00:00', closesAt: '21:00:00'},
      ],
    });
  });

  it('sorts weekly windows and rejects overlap', () => {
    expect(
      normalizeChefKitchenScheduleUpdate({
        acceptingOrders: true,
        pausedUntil: null,
        pauseReason: null,
        weeklyWindows: [
          {dayOfWeek: 2, opensAt: '18:00', closesAt: '21:00'},
          {dayOfWeek: 1, opensAt: '09:00', closesAt: '14:00'},
        ],
      }).weeklyWindows,
    ).toEqual([
      {dayOfWeek: 1, opensAt: '09:00', closesAt: '14:00'},
      {dayOfWeek: 2, opensAt: '18:00', closesAt: '21:00'},
    ]);

    expect(() =>
      normalizeChefKitchenScheduleUpdate({
        acceptingOrders: true,
        pausedUntil: null,
        pauseReason: null,
        weeklyWindows: [
          {dayOfWeek: 1, opensAt: '09:00', closesAt: '14:00'},
          {dayOfWeek: 1, opensAt: '13:30', closesAt: '18:00'},
        ],
      }),
    ).toThrow('CHEF_SCHEDULE_WINDOWS_OVERLAP');
  });

  it('uses exact override put/delete routes and request JSON', async () => {
    const response = {
      kitchenId: schedule.kitchenId,
      serviceDate: '2026-09-21',
      closed: false,
      reason: 'Evening only',
      windows: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          opensAt: '18:00:00',
          closesAt: '21:00:00',
        },
      ],
    };
    (httpClient.put as jest.Mock).mockResolvedValueOnce(response);
    (httpClient.delete as jest.Mock).mockResolvedValueOnce(undefined);

    await chefKitchenScheduleApi.putOverride('2026-09-21', {
      closed: false,
      reason: ' Evening only ',
      windows: [{opensAt: '18:00', closesAt: '21:00'}],
    });

    expect(httpClient.put).toHaveBeenCalledWith(
      `${CHEF_KITCHEN_SCHEDULE_PATH}/overrides/2026-09-21`,
      {
        closed: false,
        reason: 'Evening only',
        windows: [{opensAt: '18:00', closesAt: '21:00'}],
      },
      {signal: undefined},
    );

    await chefKitchenScheduleApi.deleteOverride('2026-09-21');
    expect(httpClient.delete).toHaveBeenCalledWith(
      `${CHEF_KITCHEN_SCHEDULE_PATH}/overrides/2026-09-21`,
      {signal: undefined},
    );
  });

  it('reads the exact public availability contract', async () => {
    const availability = {
      kitchenId: schedule.kitchenId,
      evaluatedAt: '2026-09-20T00:00:00Z',
      timezoneId: 'Asia/Kolkata',
      localDate: '2026-09-20',
      localTime: '05:30:00',
      kitchenActive: true,
      scheduleConfigured: true,
      acceptingOrders: true,
      paused: false,
      openBySchedule: true,
      availableNow: true,
    };
    (httpClient.get as jest.Mock).mockResolvedValueOnce(availability);

    await expect(
      chefKitchenScheduleApi.availability(schedule.kitchenId),
    ).resolves.toEqual(availability);

    expect(httpClient.get).toHaveBeenCalledWith(
      `/api/v1/catalog/kitchens/${schedule.kitchenId}/availability`,
      {
        params: undefined,
        signal: undefined,
        dedupeKey: `chef-kitchen-availability:${schedule.kitchenId}:now`,
      },
    );
  });

  it('rejects unsupported schedule response fields', async () => {
    (httpClient.get as jest.Mock).mockResolvedValueOnce({
      ...schedule,
      internalAuditId: 'private',
    });

    await expect(chefKitchenScheduleApi.get()).rejects.toThrow();
  });
});
