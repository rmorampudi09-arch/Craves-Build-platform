import {createMockRiderApi, DEMO_OTP} from './riderApi.mock';

function setup() {
  let clock = new Date(2026, 9, 19, 12, 0).getTime();
  const mock = createMockRiderApi({latencyMs: () => 0, now: () => clock});
  return {...mock, advance: (ms: number) => (clock += ms)};
}

async function acceptFirstOffer(mock: ReturnType<typeof setup>) {
  await mock.api.startShift('file:///selfie.jpg');
  mock.advance(13_000);
  const {offers} = await mock.api.postLocations([]);
  expect(offers).toHaveLength(1);
  return mock.api.acceptOffer(offers[0].offerId, 'k-accept');
}

describe('mock rider server', () => {
  it('offers an order after going online and locks it to the rider on accept', async () => {
    const mock = setup();
    const trip = await acceptFirstOffer(mock);
    expect(trip.step).toBe('TO_KITCHEN');
    expect((await mock.api.getHome()).activeTripId).toBe(trip.tripId);
    // The same idempotency key returns the same trip.
    expect(await mock.api.acceptOffer('anything', 'k-accept')).toEqual(trip);
  });

  it('expires an offer after 40 seconds', async () => {
    const mock = setup();
    await mock.api.startShift('file:///selfie.jpg');
    mock.advance(13_000);
    const {offers} = await mock.api.postLocations([]);
    mock.advance(41_000);
    await expect(mock.api.acceptOffer(offers[0].offerId, 'k')).rejects.toMatchObject({code: 'OFFER_EXPIRED'});
  });

  it('reports a lost race as 409', async () => {
    const mock = setup();
    await mock.api.startShift('file:///selfie.jpg');
    mock.advance(13_000);
    const {offers} = await mock.api.postLocations([]);
    mock.controls.loseNextRace();
    await expect(mock.api.acceptOffer(offers[0].offerId, 'k')).rejects.toMatchObject({status: 409});
  });

  it('walks the trip steps in order and credits pay on the right OTP', async () => {
    const mock = setup();
    const trip = await acceptFirstOffer(mock);
    await expect(mock.api.tripAction(trip.tripId, 'picked-up', undefined, 'a')).rejects.toMatchObject({
      code: 'STEP_CONFLICT',
    });
    await mock.api.tripAction(trip.tripId, 'arrived-pickup', undefined, 'b');
    await mock.api.tripAction(trip.tripId, 'picked-up', undefined, 'c');
    await mock.api.tripAction(trip.tripId, 'arrived-drop', undefined, 'd');
    await expect(
      mock.api.tripAction(trip.tripId, 'delivered', {method: 'OTP', otp: '0000'}, 'e1'),
    ).rejects.toMatchObject({code: 'OTP_INVALID', status: 422});
    const done = await mock.api.tripAction(trip.tripId, 'delivered', {method: 'OTP', otp: DEMO_OTP}, 'e2');
    expect(done.step).toBe('DELIVERED');
    const today = await mock.api.getEarnings('today');
    expect(today.trips[0]).toMatchObject({tripId: trip.tripId, status: 'CREDITED'});
  });

  it('allows the photo fallback only after two calls, and holds that pay', async () => {
    const mock = setup();
    const trip = await acceptFirstOffer(mock);
    for (const [action, key] of [['arrived-pickup', 'b'], ['picked-up', 'c'], ['arrived-drop', 'd']] as const) {
      await mock.api.tripAction(trip.tripId, action, undefined, key);
    }
    await expect(
      mock.api.tripAction(trip.tripId, 'delivered', {method: 'PHOTO', callsMade: 1}, 'p1'),
    ).rejects.toMatchObject({code: 'CALLS_REQUIRED'});
    await mock.api.tripAction(trip.tripId, 'delivered', {method: 'PHOTO', callsMade: 2}, 'p2');
    expect((await mock.api.getEarnings('today')).trips[0].status).toBe('HELD');
  });

  it('pages earnings with a cursor', async () => {
    const mock = setup();
    const first = await mock.api.getEarnings('week');
    expect(first.trips.length).toBeLessThanOrEqual(20);
    if (first.nextCursor) {
      const second = await mock.api.getEarnings('week', first.nextCursor);
      expect(second.trips[0].tripId).not.toBe(first.trips[0].tripId);
    }
  });

  it('stops the shift when ops ends it', async () => {
    const mock = setup();
    await mock.api.startShift('file:///selfie.jpg');
    mock.controls.stopShift();
    expect(await mock.api.postLocations([])).toMatchObject({stop: true});
    expect((await mock.api.getHome()).online).toBe(false);
  });
});
