import { createMockRiderApi, DEMO_OTP } from './riderApi.mock';

function setup() {
  let clock = new Date(2026, 9, 19, 12, 0).getTime();
  const mock = createMockRiderApi({ latencyMs: () => 0, now: () => clock });
  return { ...mock, advance: (ms: number) => (clock += ms) };
}

async function acceptFirstOffer(mock: ReturnType<typeof setup>) {
  await mock.api.startShift('file:///selfie.jpg', 'android-id-1');
  mock.advance(13_000);
  const { offers } = await mock.api.postLocations([]);
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

  it('lets a pending rider correct their sign-up, setting aside an account sent in the old name', async () => {
    const mock = setup();
    mock.controls.setStatus('PENDING');
    await mock.api.signUp({ name: 'K Gopi', language: 'en', vehicleKind: 'BICYCLE', adult: true });
    await mock.api.submitPayoutAccount({ method: 'UPI', holderName: 'K Gopi', upiId: 'gopi@axl' });
    expect((await mock.api.getProfile()).payoutAccountSubmitted).toBe('go****@axl');

    // A bicycle had no plate on file, so a scooter needs one.
    await expect(
      mock.api.signUp({ name: 'K Gopi', language: 'en', vehicleKind: 'PETROL', adult: true }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    const me = await mock.api.signUp({
      name: 'Kancharla Gopi',
      language: 'te',
      vehicleKind: 'PETROL',
      vehicleRegNumber: 'TS08AB4821',
      adult: true,
    });
    expect(me).toMatchObject({ name: 'Kancharla Gopi', language: 'te', status: 'PENDING' });
    const profile = await mock.api.getProfile();
    expect(profile.vehicle).toEqual({ label: 'Petrol two-wheeler', regNumberMasked: 'TS08xx4821', kind: 'PETROL' });
    expect(profile.payoutAccountSubmitted).toBeUndefined();

    // An empty plate keeps the one on file.
    await mock.api.signUp({ name: 'Kancharla Gopi', language: 'en', vehicleKind: 'ELECTRIC', vehicleRegNumber: '', adult: true });
    expect((await mock.api.getProfile()).vehicle).toMatchObject({ kind: 'ELECTRIC', regNumberMasked: 'TS08xx4821' });
  });

  it('keeps what ops already checked: no new name after an accepted account or document, no other vehicle after the RC', async () => {
    const mock = setup();
    mock.controls.setStatus('PENDING');
    await mock.api.signUp({ name: 'K Gopi', language: 'en', vehicleKind: 'PETROL', vehicleRegNumber: 'TS08AB4821', adult: true });
    await mock.api.submitPayoutAccount({ method: 'UPI', holderName: 'K Gopi', upiId: 'gopi@axl' });
    await mock.api.uploadDocument('RC', 'file:///rc.jpg');
    mock.controls.acceptSignUp();
    const profile = await mock.api.getProfile();
    expect(profile.payoutAccountMasked).toBe('go****@axl');
    expect(profile.documents.find(doc => doc.type === 'RC')?.status).toBe('VERIFIED');

    const details = { name: 'K Gopi', language: 'en' as const, vehicleKind: 'PETROL' as const, vehicleRegNumber: '', adult: true };
    await expect(mock.api.signUp({ ...details, name: 'Ravi Kumar' })).rejects.toMatchObject({ code: 'NAME_LOCKED' });
    await expect(mock.api.signUp({ ...details, vehicleKind: 'ELECTRIC' })).rejects.toMatchObject({ code: 'VEHICLE_LOCKED' });
    await expect(mock.api.signUp({ ...details, vehicleRegNumber: 'TS10AB1234' })).rejects.toMatchObject({ code: 'VEHICLE_LOCKED' });
    // The same words in another order, the same plate and a new language still save.
    expect(await mock.api.signUp({ ...details, name: 'Gopi K', language: 'hi' })).toMatchObject({ name: 'Gopi K', language: 'hi' });
  });

  it('expires an offer after 40 seconds', async () => {
    const mock = setup();
    await mock.api.startShift('file:///selfie.jpg', 'android-id-1');
    mock.advance(13_000);
    const { offers } = await mock.api.postLocations([]);
    mock.advance(41_000);
    await expect(
      mock.api.acceptOffer(offers[0].offerId, 'k'),
    ).rejects.toMatchObject({ code: 'OFFER_EXPIRED' });
  });

  it('reports a lost race as 409', async () => {
    const mock = setup();
    await mock.api.startShift('file:///selfie.jpg', 'android-id-1');
    mock.advance(13_000);
    const { offers } = await mock.api.postLocations([]);
    mock.controls.loseNextRace();
    await expect(
      mock.api.acceptOffer(offers[0].offerId, 'k'),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('walks the trip steps in order and credits pay on the right OTP', async () => {
    const mock = setup();
    const trip = await acceptFirstOffer(mock);
    await expect(
      mock.api.tripAction(trip.tripId, 'picked-up', undefined, 'a'),
    ).rejects.toMatchObject({
      code: 'STEP_CONFLICT',
    });
    await mock.api.tripAction(trip.tripId, 'arrived-pickup', undefined, 'b');
    await mock.api.tripAction(trip.tripId, 'picked-up', undefined, 'c');
    await mock.api.tripAction(trip.tripId, 'arrived-drop', undefined, 'd');
    await expect(
      mock.api.tripAction(
        trip.tripId,
        'delivered',
        { method: 'OTP', otp: '0000' },
        'e1',
      ),
    ).rejects.toMatchObject({ code: 'OTP_INVALID', status: 422 });
    const done = await mock.api.tripAction(
      trip.tripId,
      'delivered',
      { method: 'OTP', otp: DEMO_OTP },
      'e2',
    );
    expect(done.step).toBe('DELIVERED');
    const today = await mock.api.getEarnings('today');
    expect(today.trips[0]).toMatchObject({
      tripId: trip.tripId,
      status: 'CREDITED',
    });
  });

  it('counts down the OTP tries and locks on the fifth wrong code', async () => {
    const mock = setup();
    const trip = await acceptFirstOffer(mock);
    for (const [action, key] of [
      ['arrived-pickup', 'b'],
      ['picked-up', 'c'],
      ['arrived-drop', 'd'],
    ] as const) {
      await mock.api.tripAction(trip.tripId, action, undefined, key);
    }
    const tryOtp = (otp: string, key: string) =>
      mock.api.tripAction(
        trip.tripId,
        'delivered',
        { method: 'OTP', otp },
        key,
      );
    for (const left of [4, 3, 2, 1]) {
      await expect(tryOtp('0000', `wrong-${left}`)).rejects.toMatchObject({
        code: 'OTP_INVALID',
        status: 422,
        attemptsLeft: left,
      });
    }
    await expect(tryOtp('0000', 'wrong-0')).rejects.toMatchObject({
      code: 'OTP_LOCKED',
      status: 423,
      attemptsLeft: undefined,
    });
    await expect(tryOtp(DEMO_OTP, 'right')).rejects.toMatchObject({
      code: 'OTP_LOCKED',
      status: 423,
    });
    // The photo route still works after the lock, at once: no calls needed, like the server.
    const done = await mock.api.tripAction(
      trip.tripId,
      'delivered',
      { method: 'PHOTO', callsMade: 0 },
      'photo',
    );
    expect(done.step).toBe('DELIVERED');
  });

  it('returns an opaque shift credential and refuses an unapproved phone once', async () => {
    const mock = setup();
    const shift = await mock.api.startShift('file:///selfie.jpg', 'android-id-1');
    expect(shift.shiftCredential).toEqual(expect.any(String));
    expect(Date.parse(shift.expiresAt)).toBe(
      new Date(2026, 9, 19, 24, 0).getTime(),
    ); // 12 hours after noon
    const device = {
      installationId: 'android-id-1',
      fcmToken: 'token',
      appVersion: '1.0.0',
      model: 'Redmi Note 13',
    };
    await expect(mock.api.registerDevice(device)).resolves.toBeUndefined();
    mock.controls.failNextDeviceCheck();
    await expect(mock.api.registerDevice(device)).rejects.toMatchObject({
      code: 'DEVICE_NOT_BOUND',
      status: 409,
    });
    await expect(mock.api.registerDevice(device)).resolves.toBeUndefined();
  });

  it('refuses a shift from an unapproved phone once, like the dev panel says', async () => {
    const mock = setup();
    mock.controls.failNextDeviceCheck();
    await expect(
      mock.api.startShift('file:///selfie.jpg', 'android-id-2'),
    ).rejects.toMatchObject({ code: 'DEVICE_NOT_BOUND', status: 409 });
    expect((await mock.api.getHome()).online).toBe(false);
    await expect(
      mock.api.startShift('file:///selfie.jpg', 'android-id-2'),
    ).resolves.toMatchObject({ shiftCredential: expect.any(String) });
  });

  it('has demo data for every screen: slot, rest point, banner, pay lines, sealed bag, WhatsApp', async () => {
    const mock = setup();
    expect(await mock.api.getHome()).toMatchObject({
      nextSlot: { zoneName: 'Madhapur & Kondapur' },
      guaranteedPerHourPaise: 8000,
      restPoint: { name: "Lakshmi's Kitchen", area: 'Madhapur' },
      banner: { tone: 'warning', text: expect.stringContaining('rain') },
    });
    expect((await mock.api.getMe()).supportWhatsappUrl).toBe(
      'https://chat.whatsapp.com/demo',
    );
    await mock.api.startShift('file:///selfie.jpg', 'android-id-1');
    mock.advance(13_000);
    const [offer] = (await mock.api.postLocations([])).offers;
    expect(offer.payLines[0]).toEqual({ label: 'base', amountPaise: 4000 });
    // The server's lines make up its locked pay; the app never adds them up itself.
    expect(
      offer.payLines.reduce((sum, line) => sum + line.amountPaise, 0),
    ).toBe(offer.payPaise);
    expect(offer.itemsCount).toBeGreaterThan(0);
    const trip = await mock.api.acceptOffer(offer.offerId, 'k');
    expect(trip).toMatchObject({
      sealed: true,
      chefReadyAt: expect.any(String),
      itemsCount: offer.itemsCount,
    });
  });

  it("the dev panel's Send an offer now sends a whole offer, items included", async () => {
    const mock = setup();
    await mock.api.startShift('file:///selfie.jpg', 'android-id-1');
    mock.controls.sendOfferNow();
    const [offer] = (await mock.api.postLocations([])).offers;
    expect(offer).toMatchObject({
      estMinutes: expect.any(Number),
      itemsCount: expect.any(Number),
      payLines: expect.any(Array),
    });
  });

  it('allows the photo fallback only after two calls, and holds that pay', async () => {
    const mock = setup();
    const trip = await acceptFirstOffer(mock);
    for (const [action, key] of [
      ['arrived-pickup', 'b'],
      ['picked-up', 'c'],
      ['arrived-drop', 'd'],
    ] as const) {
      await mock.api.tripAction(trip.tripId, action, undefined, key);
    }
    await expect(
      mock.api.tripAction(
        trip.tripId,
        'delivered',
        { method: 'PHOTO', callsMade: 1 },
        'p1',
      ),
    ).rejects.toMatchObject({ code: 'CALLS_REQUIRED' });
    await mock.api.tripAction(
      trip.tripId,
      'delivered',
      { method: 'PHOTO', callsMade: 2 },
      'p2',
    );
    expect((await mock.api.getEarnings('today')).trips[0].status).toBe('HELD');
  });

  it('shows the order code chefs and customers see', async () => {
    const mock = setup();
    const trip = await acceptFirstOffer(mock);
    expect(trip.orderCode).toMatch(/^#[0-9A-F]{8}$/);
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
    await mock.api.startShift('file:///selfie.jpg', 'android-id-1');
    mock.controls.stopShift();
    expect(await mock.api.postLocations([])).toMatchObject({ stop: true });
    expect((await mock.api.getHome()).online).toBe(false);
  });
});
