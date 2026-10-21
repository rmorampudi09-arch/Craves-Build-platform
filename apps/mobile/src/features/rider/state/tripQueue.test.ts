import {AppApiError} from '../../../core/http/apiError';
import {riderApi} from '../api/riderApi';
import {tripQueue} from './tripQueue';

jest.mock('../api/riderApi', () => ({riderApi: {tripAction: jest.fn()}}));

const tripAction = riderApi.tripAction as jest.Mock;
const step = (riderId: string) => ({riderId, tripId: 't1', action: 'picked-up' as const, key: `rider-picked-up-t1-${riderId}`});

describe('tripQueue: what the live server says decides whether a step is kept', () => {
  it('keeps a step on 401: the session needs renewing, the step was not refused', async () => {
    tripAction.mockRejectedValueOnce(new AppApiError('HTTP_401', 'Your session could not be verified.', 401));
    await expect(tripQueue.enqueue(step('r401'))).resolves.toEqual({kind: 'queued'});
    expect(await tripQueue.pending('r401')).toBe(1);
  });

  it.each([
    ['no connection', new AppApiError('NETWORK_ERROR', 'No internet', undefined, undefined, true)],
    ['a server error', new AppApiError('HTTP_503', 'Unavailable', 503, undefined, true)],
  ])('keeps a step on %s', async (_name, error) => {
    const riderId = `r-${error.code}`;
    tripAction.mockRejectedValueOnce(error);
    await expect(tripQueue.enqueue(step(riderId))).resolves.toEqual({kind: 'queued'});
    expect(await tripQueue.pending(riderId)).toBe(1);
  });

  it('drops the step when the server refuses it, with its code and tries left', async () => {
    tripAction.mockRejectedValueOnce(
      new AppApiError('OTP_INVALID', 'Wrong code.', 422, undefined, false, false, [], undefined, 2),
    );
    await expect(tripQueue.enqueue({...step('r422'), action: 'delivered', body: {method: 'OTP', otp: '1111'}})).resolves.toEqual({
      kind: 'rejected',
      code: 'OTP_INVALID',
      message: 'Wrong code.',
      attemptsLeft: 2,
    });
    expect(await tripQueue.pending('r422')).toBe(0);
  });
});
