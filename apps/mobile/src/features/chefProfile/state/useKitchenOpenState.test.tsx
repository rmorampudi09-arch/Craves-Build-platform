import React from 'react';
import {act, create} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AppApiError} from '../../../core/http/apiError';
import {chefKitchenScheduleApi} from '../../chefSchedule/api/chefKitchenScheduleApi';
import {chefProfileApi, type ChefKitchenProfile} from '../api/chefProfileApi';
import {deriveKitchenHours, useKitchenOpenState} from './useKitchenOpenState';

jest.mock('../../../app/store/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({auth: {identity: {id: 'chef-1'}}}),
}));
jest.mock('../api/chefProfileApi', () => ({
  chefProfileApi: {getKitchen: jest.fn(), replaceKitchen: jest.fn()},
}));
jest.mock('../../chefSchedule/api/chefKitchenScheduleApi', () => ({
  ...jest.requireActual('../../chefSchedule/api/chefKitchenScheduleApi'),
  chefKitchenScheduleApi: {get: jest.fn(), replace: jest.fn()},
}));

const KITCHEN_ID = '11111111-1111-4111-8111-111111111111';
const WINDOW_ID = '22222222-2222-4222-8222-222222222222';
const kitchen: ChefKitchenProfile = {
  id: KITCHEN_ID,
  identityId: '33333333-3333-4333-8333-333333333333',
  kitchenName: 'Relangi mavayya kitchen',
  displayName: 'Relangi',
  description: 'Home food',
  phoneNumber: '+919999999999',
  email: null,
  addressLine1: '12 Main Road',
  addressLine2: null,
  landmark: null,
  areaName: 'KPHB',
  city: 'Hyderabad',
  state: 'Telangana',
  postalCode: '500072',
  latitude: 17.49,
  longitude: 78.39,
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
};
const schedule = {
  kitchenId: KITCHEN_ID,
  timezoneId: 'Asia/Kolkata',
  acceptingOrders: true,
  pausedUntil: null as string | null,
  pauseReason: null as string | null,
  weeklyWindows: [{id: WINDOW_ID, dayOfWeek: 3, opensAt: '11:00:00', closesAt: '22:00:00'}],
};
// 14 Oct 2026 is a Wednesday (day 3); the clock stands at 2:00 PM, inside the 11:00-22:00 hours.
const setClock = (hours: number) => jest.spyOn(Date, 'now').mockReturnValue(new Date(2026, 9, 14, hours, 0).getTime());
const get = (mock: unknown) => mock as jest.Mock;

// The server keeps what was saved, so the refetch after a save sees it too.
function serverSaves(saved: ChefKitchenProfile) {
  get(chefProfileApi.replaceKitchen).mockImplementation(async () => {
    get(chefProfileApi.getKitchen).mockResolvedValue(saved);
    return saved;
  });
}

async function settle() {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise<void>(resolve => setTimeout(resolve, 10));
    });
  }
}

async function mountHook() {
  const result: {current: ReturnType<typeof useKitchenOpenState>} = {current: undefined as never};
  function Probe() {
    result.current = useKitchenOpenState();
    return null;
  }
  const queryClient = new QueryClient({defaultOptions: {queries: {retry: false, gcTime: Infinity}}});
  await act(async () => {
    create(
      <QueryClientProvider client={queryClient}>
        <Probe />
      </QueryClientProvider>,
    );
  });
  await settle();
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  setClock(14);
  get(chefProfileApi.getKitchen).mockResolvedValue(kitchen);
  get(chefKitchenScheduleApi.get).mockResolvedValue(schedule);
});
afterEach(() => jest.restoreAllMocks());

describe('useKitchenOpenState status', () => {
  it('is open for an active kitchen and closed for an inactive one', async () => {
    const open = await mountHook();
    expect(open.current.status).toBe('open');
    expect(open.current.kitchen?.kitchenName).toBe('Relangi mavayya kitchen');

    get(chefProfileApi.getKitchen).mockResolvedValue({...kitchen, status: 'INACTIVE'});
    const closed = await mountHook();
    expect(closed.current.status).toBe('closed');
  });

  it('is unknown until the kitchen loads or when it cannot be loaded', async () => {
    get(chefProfileApi.getKitchen).mockRejectedValue(new Error('offline'));
    const failed = await mountHook();
    expect(failed.current.status).toBe('unknown');
    expect(failed.current.unavailable).toBe(true);
  });

  it('is paused while the pause lasts and open again once it has passed', async () => {
    const until = new Date(Date.now() + 40 * 60_000).toISOString();
    get(chefKitchenScheduleApi.get).mockResolvedValue({...schedule, pausedUntil: until});
    const paused = await mountHook();
    expect(paused.current.status).toBe('paused');
    expect(paused.current.pausedUntil).toBe(until);

    get(chefKitchenScheduleApi.get).mockResolvedValue({...schedule, pausedUntil: new Date(Date.now() - 60_000).toISOString()});
    const expired = await mountHook();
    expect(expired.current.status).toBe('open');
    expect(expired.current.pausedUntil).toBeNull();
  });

  it('offers pausing only when the schedule route is published', async () => {
    const published = await mountHook();
    expect(published.current.pauseAvailable).toBe(true);

    get(chefKitchenScheduleApi.get).mockRejectedValue(new AppApiError('NOT_FOUND', 'No route', 404));
    const missing = await mountHook();
    expect(missing.current.pauseAvailable).toBe(false);
    expect(missing.current.status).toBe('open');
  });
});

describe('useKitchenOpenState closed reasons', () => {
  it('says only "closed" after the chef closed the kitchen, even when it has hours today', async () => {
    get(chefProfileApi.getKitchen).mockResolvedValue({...kitchen, status: 'INACTIVE'});
    setClock(9);
    const state = await mountHook();
    expect(state.current.status).toBe('closed');
    expect(state.current.closedReason).toBe('chef');
    expect(state.current.opensAt).toBeNull();
  });

  it('is closed, not taking orders, when the schedule says so', async () => {
    get(chefKitchenScheduleApi.get).mockResolvedValue({...schedule, acceptingOrders: false});
    const state = await mountHook();
    expect(state.current.status).toBe('closed');
    expect(state.current.closedReason).toBe('not-accepting');
  });

  it("is closed until its next opening when an active kitchen is outside today's hours", async () => {
    setClock(9);
    const early = await mountHook();
    expect(early.current.status).toBe('closed');
    expect(early.current.closedReason).toBe('outside-hours');
    expect(early.current.opensAt).toBe('11:00 AM');

    setClock(23);
    const late = await mountHook();
    expect(late.current.closedReason).toBe('outside-hours');
    expect(late.current.opensAt).toBeNull();
  });

  it("is open inside today's hours and has no closed reason", async () => {
    const state = await mountHook();
    expect(state.current.status).toBe('open');
    expect(state.current.closedReason).toBeNull();
  });
});

describe('useKitchenOpenState refresh', () => {
  it('reads the kitchen and the schedule again', async () => {
    const state = await mountHook();
    expect(chefProfileApi.getKitchen).toHaveBeenCalledTimes(1);
    await act(async () => {
      await state.current.refresh();
    });
    expect(chefProfileApi.getKitchen).toHaveBeenCalledTimes(2);
    expect(chefKitchenScheduleApi.get).toHaveBeenCalledTimes(2);
  });

  it('recovers from a failed first read', async () => {
    get(chefProfileApi.getKitchen).mockRejectedValueOnce(new Error('offline'));
    const state = await mountHook();
    expect(state.current.unavailable).toBe(true);
    await act(async () => {
      await state.current.refresh();
    });
    await settle();
    expect(state.current.status).toBe('open');
    expect(state.current.unavailable).toBe(false);
  });
});

describe('useKitchenOpenState actions', () => {
  it('closes the kitchen with the full current kitchen and status INACTIVE', async () => {
    serverSaves({...kitchen, status: 'INACTIVE'});
    const state = await mountHook();
    await act(async () => {
      await state.current.setOpen(false);
    });
    await settle();
    const request = get(chefProfileApi.replaceKitchen).mock.calls[0][0];
    expect(request).toEqual({
      kitchenName: kitchen.kitchenName,
      displayName: kitchen.displayName,
      description: kitchen.description,
      phoneNumber: kitchen.phoneNumber,
      email: null,
      addressLine1: kitchen.addressLine1,
      addressLine2: null,
      landmark: null,
      areaName: kitchen.areaName,
      city: kitchen.city,
      state: kitchen.state,
      postalCode: kitchen.postalCode,
      latitude: kitchen.latitude,
      longitude: kitchen.longitude,
      status: 'INACTIVE',
    });
    expect(state.current.status).toBe('closed');
  });

  it('builds the request from the kitchen as the server has it right now, not the copy read a minute ago', async () => {
    const state = await mountHook();
    // The chef renamed the kitchen and moved the pin elsewhere after this copy was read.
    const latest = {...kitchen, kitchenName: 'Renamed elsewhere', phoneNumber: '+910000000000', latitude: 18.1, longitude: 79.2};
    get(chefProfileApi.getKitchen).mockResolvedValue(latest);
    serverSaves({...latest, status: 'INACTIVE'});
    await act(async () => {
      expect(await state.current.setOpen(false)).toBe(true);
    });
    expect(get(chefProfileApi.replaceKitchen).mock.calls[0][0]).toMatchObject({
      kitchenName: 'Renamed elsewhere',
      phoneNumber: '+910000000000',
      latitude: 18.1,
      longitude: 79.2,
      status: 'INACTIVE',
    });
  });

  it('does not save when Craves paused the kitchen after the copy was read', async () => {
    const state = await mountHook();
    get(chefProfileApi.getKitchen).mockResolvedValue({...kitchen, status: 'SUSPENDED'});
    await act(async () => {
      await expect(state.current.setOpen(true)).rejects.toThrow('KITCHEN_SUSPENDED');
    });
    expect(chefProfileApi.replaceKitchen).not.toHaveBeenCalled();
  });

  it('sends nothing when the server already has the status asked for, and says it saved', async () => {
    const state = await mountHook();
    get(chefProfileApi.getKitchen).mockResolvedValue({...kitchen, status: 'INACTIVE'});
    await act(async () => {
      expect(await state.current.setOpen(false)).toBe(true);
    });
    expect(chefProfileApi.replaceKitchen).not.toHaveBeenCalled();
  });

  it('sends nothing when the latest kitchen cannot be read', async () => {
    const state = await mountHook();
    get(chefProfileApi.getKitchen).mockRejectedValue(new Error('offline'));
    await act(async () => {
      await expect(state.current.setOpen(false)).rejects.toThrow('offline');
    });
    expect(chefProfileApi.replaceKitchen).not.toHaveBeenCalled();
  });

  it('opens the kitchen with status ACTIVE', async () => {
    get(chefProfileApi.getKitchen).mockResolvedValue({...kitchen, status: 'INACTIVE'});
    serverSaves(kitchen);
    const state = await mountHook();
    await act(async () => {
      await state.current.setOpen(true);
    });
    await settle();
    expect(get(chefProfileApi.replaceKitchen).mock.calls[0][0]).toMatchObject({status: 'ACTIVE'});
    expect(state.current.status).toBe('open');
  });

  it('sends one request when the button is pressed twice, and tells the second caller it was skipped', async () => {
    let finish: (value: unknown) => void = () => undefined;
    get(chefProfileApi.replaceKitchen).mockReturnValue(new Promise(resolve => (finish = resolve)));
    const state = await mountHook();
    await act(async () => {
      const first = state.current.setOpen(false);
      const second = state.current.setOpen(false);
      // The skipped press settles at once, before the real save has finished.
      expect(await second).toBe(false);
      finish({...kitchen, status: 'INACTIVE'});
      expect(await first).toBe(true);
    });
    expect(chefProfileApi.replaceKitchen).toHaveBeenCalledTimes(1);
  });

  it('reports a pause or resume that was skipped the same way', async () => {
    let finish: (value: unknown) => void = () => undefined;
    get(chefKitchenScheduleApi.replace).mockReturnValue(new Promise(resolve => (finish = resolve)));
    const state = await mountHook();
    await act(async () => {
      const first = state.current.pause(30);
      expect(await state.current.resume()).toBe(false);
      finish(schedule);
      expect(await first).toBe(true);
    });
    expect(chefKitchenScheduleApi.replace).toHaveBeenCalledTimes(1);
  });

  it('never saves ACTIVE over a suspended kitchen', async () => {
    get(chefProfileApi.getKitchen).mockResolvedValue({...kitchen, status: 'SUSPENDED'});
    const state = await mountHook();
    expect(state.current.status).toBe('suspended');
    await act(async () => {
      await expect(state.current.setOpen(true)).rejects.toThrow('KITCHEN_SUSPENDED');
      await expect(state.current.setOpen(false)).rejects.toThrow('KITCHEN_SUSPENDED');
    });
    expect(chefProfileApi.replaceKitchen).not.toHaveBeenCalled();
  });

  it('turns orders back on in the schedule when it says it is not taking orders', async () => {
    get(chefKitchenScheduleApi.get).mockResolvedValue({...schedule, acceptingOrders: false});
    get(chefKitchenScheduleApi.replace).mockResolvedValue(schedule);
    const state = await mountHook();
    await act(async () => {
      await state.current.setOpen(true);
    });
    expect(chefProfileApi.replaceKitchen).not.toHaveBeenCalled();
    expect(get(chefKitchenScheduleApi.replace).mock.calls[0][0]).toMatchObject({acceptingOrders: true});
  });

  it('pauses by writing pausedUntil into the schedule and keeps the weekly hours', async () => {
    get(chefKitchenScheduleApi.replace).mockImplementation(async (request: {pausedUntil: string}) => ({
      ...schedule,
      pausedUntil: request.pausedUntil,
    }));
    const state = await mountHook();
    const before = Date.now();
    await act(async () => {
      await state.current.pause(60);
    });
    const request = get(chefKitchenScheduleApi.replace).mock.calls[0][0];
    expect(request.weeklyWindows).toEqual([{dayOfWeek: 3, opensAt: '11:00:00', closesAt: '22:00:00'}]);
    expect(Date.parse(request.pausedUntil)).toBeGreaterThanOrEqual(before + 60 * 60_000);
    expect(Date.parse(request.pausedUntil)).toBeLessThan(Date.now() + 60 * 60_000 + 1000);
    expect(state.current.status).toBe('paused');
  });

  it('pauses for the rest of today until the next midnight', async () => {
    get(chefKitchenScheduleApi.replace).mockImplementation(async (request: {pausedUntil: string}) => ({
      ...schedule,
      pausedUntil: request.pausedUntil,
    }));
    const state = await mountHook();
    await act(async () => {
      await state.current.pause('rest-of-day');
    });
    const until = new Date(get(chefKitchenScheduleApi.replace).mock.calls[0][0].pausedUntil);
    expect(until.getHours()).toBe(0);
    expect(until.getMinutes()).toBe(0);
    expect(until.getTime()).toBeGreaterThan(Date.now());
    expect(until.getTime() - Date.now()).toBeLessThanOrEqual(24 * 60 * 60_000);
  });

  it('resumes by clearing pausedUntil', async () => {
    get(chefKitchenScheduleApi.get).mockResolvedValue({...schedule, pausedUntil: new Date(Date.now() + 3_600_000).toISOString()});
    get(chefKitchenScheduleApi.replace).mockResolvedValue(schedule);
    const state = await mountHook();
    await act(async () => {
      await state.current.resume();
    });
    expect(get(chefKitchenScheduleApi.replace).mock.calls[0][0]).toMatchObject({pausedUntil: null, pauseReason: null});
    expect(state.current.status).toBe('open');
  });
});

describe('deriveKitchenHours', () => {
  const windows = [
    {dayOfWeek: 3, opensAt: '18:00:00', closesAt: '22:00:00'},
    {dayOfWeek: 3, opensAt: '11:00:00', closesAt: '15:00:00'},
    {dayOfWeek: 4, opensAt: '08:00:00', closesAt: '09:00:00'},
  ];
  // 14 Oct 2026 is a Wednesday.
  const at = (hours: number) => new Date(2026, 9, 14, hours, 0);

  it("shows today's opening hours and the next opening still to come today", () => {
    expect(deriveKitchenHours({weeklyWindows: windows}, at(9))).toEqual({hoursToday: '11:00 AM – 10:00 PM', opensAt: '11:00 AM', outsideHours: true});
    expect(deriveKitchenHours({weeklyWindows: windows}, at(16)).opensAt).toBe('6:00 PM');
    expect(deriveKitchenHours({weeklyWindows: windows}, at(23)).opensAt).toBeNull();
  });

  it('has nothing to show without a schedule or without hours today', () => {
    expect(deriveKitchenHours(null, at(9))).toEqual({hoursToday: null, opensAt: null, outsideHours: false});
    expect(deriveKitchenHours({weeklyWindows: [windows[2]]}, at(9))).toEqual({hoursToday: null, opensAt: null, outsideHours: false});
  });

  it('is outside the hours before, between and after the windows, and inside during one', () => {
    expect(deriveKitchenHours({weeklyWindows: windows}, at(9)).outsideHours).toBe(true);
    expect(deriveKitchenHours({weeklyWindows: windows}, at(12)).outsideHours).toBe(false);
    expect(deriveKitchenHours({weeklyWindows: windows}, at(16)).outsideHours).toBe(true);
    expect(deriveKitchenHours({weeklyWindows: windows}, at(19)).outsideHours).toBe(false);
    expect(deriveKitchenHours({weeklyWindows: windows}, at(23)).outsideHours).toBe(true);
    // The closing minute is already closed.
    expect(deriveKitchenHours({weeklyWindows: windows}, new Date(2026, 9, 14, 15, 0)).outsideHours).toBe(true);
  });

  it('writes a 23:59 close as Midnight, and stays open through that last minute', () => {
    const late = [{dayOfWeek: 3, opensAt: '11:00:00', closesAt: '23:59:00'}];
    expect(deriveKitchenHours({weeklyWindows: late}, at(14)).hoursToday).toBe('11:00 AM – Midnight');
    expect(deriveKitchenHours({weeklyWindows: late}, new Date(2026, 9, 14, 23, 59)).outsideHours).toBe(false);
    expect(deriveKitchenHours({weeklyWindows: late}, at(9)).outsideHours).toBe(true);
    const split = [
      {dayOfWeek: 3, opensAt: '11:00:00', closesAt: '15:00:00'},
      {dayOfWeek: 3, opensAt: '18:00:00', closesAt: '23:59:00'},
    ];
    expect(deriveKitchenHours({weeklyWindows: split}, at(16)).hoursToday).toBe('11:00 AM – Midnight');
  });

  it('counts Sunday as day 7', () => {
    const sunday = new Date(2026, 9, 18, 9, 0);
    expect(deriveKitchenHours({weeklyWindows: [{dayOfWeek: 7, opensAt: '10:00', closesAt: '12:00'}]}, sunday).hoursToday).toBe('10:00 AM – 12:00 PM');
  });
});
