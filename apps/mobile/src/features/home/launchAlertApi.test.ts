import {httpClient} from '../../core/http/httpClient';
import {LAUNCH_ALERTS_PATH, LaunchAlertContractError, launchAlertApi} from './api/launchAlertApi';

jest.mock('../../core/http/httpClient', () => ({
  httpClient: {
    get: jest.fn(),
    put: jest.fn(),
  },
}));

const getMock = httpClient.get as jest.Mock;
const putMock = httpClient.put as jest.Mock;

describe('launch alert API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('asks the customer launch-alerts route about the exact spot', async () => {
    getMock.mockResolvedValueOnce({subscribed: true});

    await expect(launchAlertApi.isSubscribed(17.4648, 78.3567)).resolves.toBe(true);
    expect(getMock).toHaveBeenCalledWith(LAUNCH_ALERTS_PATH, {
      params: {latitude: 17.4648, longitude: 78.3567},
      signal: undefined,
      dedupeKey: 'launch-alert:17.4648:78.3567',
    });
  });

  it('saves the spot and area name with PUT', async () => {
    putMock.mockResolvedValueOnce({subscribed: true});

    await expect(launchAlertApi.subscribe(17.4648, 78.3567, 'Kondapur')).resolves.toBe(true);
    expect(putMock).toHaveBeenCalledWith(LAUNCH_ALERTS_PATH, {
      latitude: 17.4648,
      longitude: 78.3567,
      areaName: 'Kondapur',
    });
  });

  it('rejects an answer without a subscribed flag', async () => {
    getMock.mockResolvedValueOnce({status: 'ok'});

    await expect(launchAlertApi.isSubscribed(17.4648, 78.3567)).rejects.toBeInstanceOf(LaunchAlertContractError);
  });
});
