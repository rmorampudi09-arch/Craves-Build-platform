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

  it('counts down the OTP tries and locks on the fifth wrong code', async () => {
    const mock = setup();
    const trip = await acceptFirstOffer(mock);
    for (const [action, key] of [['arrived-pickup', 'b'], ['picked-up', 'c'], ['arrived-drop', 'd']] as const) {
      await mock.api.tripAction(trip.tripId, action, undefined, key);
    }
    const tryOtp = (otp: string, key: string) => mock.api.tripAction(trip.tripId, 'delivered', {method: 'OTP', otp}, key);
    for (const left of [4, 3, 2, 1]) {
      await expect(tryOtp('0000', `wrong-${left}`)).rejects.toMatchObject({code: 'OTP_INVALID', status: 422, attemptsLeft: left});
    }
    await expect(tryOtp('0000', 'wrong-0')).rejects.toMatchObject({code: 'OTP_LOCKED', status: 423, attemptsLeft: undefined});
    await expect(tryOtp(DEMO_OTP, 'right')).rejects.toMatchObject({code: 'OTP_LOCKED', status: 423});
    // The photo route still works after the lock.
    const done = await mock.api.tripAction(trip.tripId, 'delivered', {method: 'PHOTO', callsMade: 2}, 'photo');
    expect(done.step).toBe('DELIVERED');
  });

  it('returns an opaque shift credential and refuses an unapproved phone once', async () => {
    const mock = setup();
    const shift = await mock.api.startShift('file:///selfie.jpg');
    expect(shift.shiftCredential).toEqual(expect.any(String));
    expect(Date.parse(shift.expiresAt)).toBe(new Date(2026, 9, 19, 24, 0).getTime()); // 12 hours after noon
    const device = {fcmToken: 'token', appVersion: '1.0.0', model: 'Redmi Note 13'};
    await expect(mock.api.registerDevice(device)).resolves.toBeUndefined();
    mock.controls.failNextDeviceCheck();
    await expect(mock.api.registerDevice(device)).rejects.toMatchObject({code: 'DEVICE_NOT_BOUND', status: 409});
    await expect(mock.api.registerDevice(device)).resolves.toBeUndefined();
  });

  it('has demo data for every screen: slot, rest point, banner, pay lines, sealed bag, WhatsApp', async () => {
    const mock = setup();
    expect(await mock.api.getHome()).toMatchObject({
      nextSlot: {zoneName: 'Madhapur & Kondapur'},
      guaranteedPerHourPaise: 8000,
      restPoint: {name: "Lakshmi's Kitchen", area: 'Madhapur'},
      banner: {tone: 'warning', text: expect.stringContaining('rain')},
    });
    expect((await mock.api.getMe()).supportWhatsappUrl).toBe('https://chat.whatsapp.com/demo');
    await mock.api.startShift('file:///selfie.jpg');
    mock.advance(13_000);
    const [offer] = (await mock.api.postLocations([])).offers;
    expect(offer.payLines[0]).toEqual({label: 'base', amountPaise: 4000});
    // The server's lines make up its locked pay; the app never adds them up itself.
    expect(offer.payLines.reduce((sum, line) => sum + line.amountPaise, 0)).toBe(offer.payPaise);
    const trip = await mock.api.acceptOffer(offer.offerId, 'k');
    expect(trip).toMatchObject({sealed: true, chefReadyAt: expect.any(String)});
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
