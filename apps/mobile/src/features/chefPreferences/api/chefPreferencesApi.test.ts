import {httpClient} from '../../../core/http/httpClient';
import {chefKitchenSettingsApi} from './chefKitchenSettingsApi';
import {notificationPreferencesApi, isChannelEnabled} from './notificationPreferencesApi';

jest.mock('../../../core/http/httpClient', () => ({httpClient: {get: jest.fn(), put: jest.fn()}}));

describe('notificationPreferencesApi', () => {
  beforeEach(() => jest.resetAllMocks());

  it('lists the saved channel settings and treats a channel with no row as on', async () => {
    (httpClient.get as jest.Mock).mockResolvedValue([
      {channel: 'EMAIL', enabled: false, updatedAt: '2026-10-13T05:00:00Z'},
      {channel: 'SMS', enabled: false, updatedAt: '2026-10-13T05:00:00Z'},
    ]);

    const list = await notificationPreferencesApi.list();

    expect(httpClient.get).toHaveBeenCalledWith('/api/v1/notifications/preferences', expect.anything());
    expect(isChannelEnabled(list, 'EMAIL')).toBe(false);
    expect(isChannelEnabled(list, 'PUSH')).toBe(true);
    expect(list).toHaveLength(1);
  });

  it('fails when the server sends something that is not a list', async () => {
    (httpClient.get as jest.Mock).mockResolvedValue({channel: 'PUSH'});
    await expect(notificationPreferencesApi.list()).rejects.toThrow();
  });

  it('saves one channel with PUT /preferences/{channel}', async () => {
    (httpClient.put as jest.Mock).mockResolvedValue({channel: 'PUSH', enabled: false, updatedAt: '2026-10-13T05:00:00Z'});

    await expect(notificationPreferencesApi.set('PUSH', false)).resolves.toMatchObject({channel: 'PUSH', enabled: false});
    expect(httpClient.put).toHaveBeenCalledWith('/api/v1/notifications/preferences/PUSH', {enabled: false}, expect.anything());
  });
});

describe('chefKitchenSettingsApi', () => {
  beforeEach(() => jest.resetAllMocks());

  it('reads the order settings', async () => {
    (httpClient.get as jest.Mock).mockResolvedValue({autoAcceptOrders: true, defaultPrepMinutes: 20});
    await expect(chefKitchenSettingsApi.get()).resolves.toEqual({autoAcceptOrders: true, defaultPrepMinutes: 20});
    expect(httpClient.get).toHaveBeenCalledWith('/api/v1/kitchens/me/settings', expect.anything());
  });

  it('keeps an unset cooking time as null', async () => {
    (httpClient.get as jest.Mock).mockResolvedValue({autoAcceptOrders: false});
    await expect(chefKitchenSettingsApi.get()).resolves.toEqual({autoAcceptOrders: false, defaultPrepMinutes: null});
  });

  it('saves both settings in one PUT and refuses a cooking time outside 5 to 120 minutes', async () => {
    (httpClient.put as jest.Mock).mockResolvedValue({autoAcceptOrders: true, defaultPrepMinutes: 30});
    await expect(chefKitchenSettingsApi.update({autoAcceptOrders: true, defaultPrepMinutes: 30})).resolves.toEqual({
      autoAcceptOrders: true,
      defaultPrepMinutes: 30,
    });
    expect(httpClient.put).toHaveBeenCalledWith(
      '/api/v1/kitchens/me/settings',
      {autoAcceptOrders: true, defaultPrepMinutes: 30},
      expect.anything(),
    );
    await expect(chefKitchenSettingsApi.update({autoAcceptOrders: true, defaultPrepMinutes: 4})).rejects.toThrow();
    await expect(chefKitchenSettingsApi.update({autoAcceptOrders: true, defaultPrepMinutes: 121})).rejects.toThrow();
    expect(httpClient.put).toHaveBeenCalledTimes(1);
  });
});
