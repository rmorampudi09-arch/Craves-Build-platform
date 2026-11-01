import {appApiErrorFromStatus} from '../../../core/http/apiError';
import type {Trip} from '../api/contract';
import {lockedAtZero} from '../api/riderApi.live';
import type {QueueEntry} from '../domain/offlineQueue';
import {createNativeTripQueue, type NativeOutbox} from './nativeTripQueue';

const trip = {tripId: 't1', step: 'PICKED_UP'} as Trip;
const entry = (id: string, extra: Partial<QueueEntry> = {}): QueueEntry => ({
  id,
  riderId: 'r1',
  tripId: 't1',
  action: 'picked-up',
  key: `key-${id}`,
  createdAt: 1_000,
  attempts: 0,
  nextAttemptAt: 0,
  ...extra,
});

/** The Kotlin module's answers, scripted: each call takes the next one; the state is what outboxState reads. */
function fakeNative() {
  const answers: unknown[] = [];
  const state = {entries: [] as QueueEntry[], refusals: [] as unknown[]};
  const next = async () => JSON.stringify(answers.shift() ?? {results: [], needsAuth: false});
  const native = {
    outboxEnqueue: jest.fn(async (_entryJson: string, _optionsJson: string) => next()),
    outboxFlush: jest.fn(async (_optionsJson: string) => next()),
    outboxImport: jest.fn(async (_json: string) => null),
    outboxState: jest.fn(async () => JSON.stringify(state)),
    outboxDefer: jest.fn(async (_id: string) => null),
    outboxDismissRefusal: jest.fn(async (_tripId: string) => null),
  } satisfies NativeOutbox;
  return {native, answers, state};
}

function setup(token: string | null = 'fresh-token') {
  const fake = fakeNative();
  const passListeners: ((json: string) => void)[] = [];
  const renewToken = jest.fn(async (): Promise<string | null> => 'renewed-token');
  const queue = createNativeTripQueue({
    native: fake.native,
    freshToken: () => token,
    renewToken,
    apiBaseUrl: () => 'https://api.craves.in',
    describe: (status, answer) => {
      const error = lockedAtZero(appApiErrorFromStatus(status, answer));
      return {code: error.code, message: error.message, attemptsLeft: error.attemptsLeft};
    },
    onPass: listener => {
      passListeners.push(listener);
      return () => undefined;
    },
  });
  return {...fake, queue, renewToken, background: (answer: unknown) => passListeners.forEach(listener => listener(JSON.stringify(answer)))};
}

describe('native trip outbox, from JS (P2-02b)', () => {
  it('saves and sends in one call; the screen gets the trip before the list changes', async () => {
    const {native, answers, queue} = setup();
    answers.push({entryId: 'e1', needsAuth: false, results: [{entry: entry('e1'), kind: 'sent', trip}]});
    const order: string[] = [];
    queue.onSent((sent, got) => order.push(`sent ${sent.id} ${got.step}`));
    queue.subscribe(() => order.push('changed'));
    const step = {riderId: 'r1', tripId: 't1', action: 'picked-up' as const, key: 'key-e1', occurredAt: 5, fix: undefined};

    await expect(queue.enqueue(step)).resolves.toEqual({kind: 'sent', trip});
    expect(order).toEqual(['sent e1 PICKED_UP', 'changed']);
    expect(JSON.parse(native.outboxEnqueue.mock.calls[0][0])).toEqual({riderId: 'r1', tripId: 't1', action: 'picked-up', key: 'key-e1', occurredAt: 5});
    expect(JSON.parse(native.outboxEnqueue.mock.calls[0][1])).toEqual({
      riderId: 'r1',
      tripId: 't1',
      accessToken: 'fresh-token',
      apiBaseUrl: 'https://api.craves.in',
    });
    expect(native.outboxDefer).not.toHaveBeenCalled();
  });

  it('marks a step still waiting after the tap as deferred, so an OTP goes as captured offline', async () => {
    const {native, answers, queue} = setup(null);
    answers.push({entryId: 'e1', needsAuth: false, results: [{entry: entry('e1'), kind: 'queued'}]});
    await expect(queue.enqueue({riderId: 'r1', tripId: 't1', action: 'arrived-drop', key: 'k'})).resolves.toEqual({kind: 'queued'});
    expect(native.outboxDefer).toHaveBeenCalledWith('e1');
    // No fresh token: native sends with the shift credential.
    expect(JSON.parse(native.outboxEnqueue.mock.calls[0][1]).accessToken).toBeNull();
  });

  it('words a refusal as the JS queue does, locks a code with no tries left, and tells listeners once', async () => {
    const {answers, queue} = setup();
    const rejected = {kind: 'rejected', status: 422, code: 'OTP_INVALID', message: 'Wrong code.', attemptsLeft: 0};
    answers.push({
      entryId: 'e1',
      needsAuth: false,
      results: [
        {entry: entry('e1', {action: 'delivered'}), ...rejected, answered: true},
        {entry: entry('e2', {action: 'failed'}), ...rejected, answered: false},
      ],
    });
    const heard: unknown[] = [];
    queue.onRejected((refused, info) => heard.push([refused.id, info]));
    const outcome = await queue.enqueue({riderId: 'r1', tripId: 't1', action: 'delivered', key: 'k', body: {method: 'OTP', otp: '1111'}});
    expect(outcome).toEqual({kind: 'rejected', code: 'OTP_LOCKED', message: 'Wrong code.', attemptsLeft: undefined});
    expect(heard).toEqual([['e1', {code: 'OTP_LOCKED', message: 'Wrong code.', attemptsLeft: undefined}]]);
  });

  it('renews the token once after a 401 and sends again, deferring nothing that went', async () => {
    const {native, answers, queue, renewToken} = setup();
    answers.push({entryId: 'e1', needsAuth: true, results: [{entry: entry('e1'), kind: 'queued'}]});
    answers.push({needsAuth: false, results: [{entry: entry('e1'), kind: 'sent', trip}]});
    await expect(queue.enqueue({riderId: 'r1', tripId: 't1', action: 'picked-up', key: 'k'})).resolves.toEqual({kind: 'sent', trip});
    expect(renewToken).toHaveBeenCalledTimes(1);
    expect(JSON.parse(native.outboxFlush.mock.calls[0][0])).toEqual({
      riderId: 'r1',
      tripId: 't1',
      accessToken: 'renewed-token',
      apiBaseUrl: 'https://api.craves.in',
    });
    expect(native.outboxDefer).not.toHaveBeenCalled();
  });

  it('keeps the step waiting when no token can be had', async () => {
    const {answers, queue, renewToken} = setup(null);
    renewToken.mockResolvedValueOnce(null);
    answers.push({entryId: 'e1', needsAuth: true, results: []});
    await expect(queue.enqueue({riderId: 'r1', tripId: 't1', action: 'picked-up', key: 'k'})).resolves.toEqual({kind: 'queued'});
  });

  it("shows a pass native ran by itself: the trip, the refusal, the list", async () => {
    const {state, queue, background} = setup();
    const sent = jest.fn();
    const refused = jest.fn();
    const changed = jest.fn();
    queue.onSent(sent);
    queue.onRejected(refused);
    queue.subscribe(changed);
    state.entries = [entry('e3', {tripId: 't2', deferred: true})];
    background({
      needsAuth: false,
      results: [
        {entry: entry('e1'), kind: 'sent', trip},
        {entry: entry('e2', {tripId: 't9'}), kind: 'rejected', status: 409, code: 'TRIP_CANCELLED', message: 'This trip was cancelled.', answered: true},
      ],
    });
    await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
    expect(sent).toHaveBeenCalledWith(expect.objectContaining({id: 'e1'}), trip);
    expect(refused).toHaveBeenCalledWith(expect.objectContaining({id: 'e2'}), {code: 'TRIP_CANCELLED', message: 'This trip was cancelled.', attemptsLeft: undefined});
    expect(changed).toHaveBeenCalled();
    expect((await queue.entries('r1')).map(e => e.id)).toEqual(['e3']);
    expect(await queue.pending('r1', 't2')).toBe(1);
  });

  it('lists refusals worded, keeps moved ones as they were, and dismisses through native', async () => {
    const {native, state, queue} = setup();
    state.refusals = [
      {riderId: 'r1', tripId: 't1', action: 'picked-up', at: 9, status: 409, code: 'TRIP_CANCELLED', message: 'This trip was cancelled.'},
      {riderId: 'r1', tripId: 't2', action: 'delivered', at: 8, status: 0, code: 'PHOTO_MISSING', message: 'Take the photo again.'},
      {riderId: 'r2', tripId: 't3', action: 'failed', at: 7, status: 500, code: '', message: ''},
    ];
    expect(await queue.refusals('r1')).toEqual([
      {riderId: 'r1', tripId: 't1', action: 'picked-up', at: 9, code: 'TRIP_CANCELLED', message: 'This trip was cancelled.', attemptsLeft: undefined},
      {riderId: 'r1', tripId: 't2', action: 'delivered', at: 8, code: 'PHOTO_MISSING', message: 'Take the photo again.', attemptsLeft: undefined},
    ]);
    expect(await queue.refusals('r2')).toEqual([expect.objectContaining({code: 'HTTP_500', message: 'Craves is temporarily unavailable. Please try again.'})]);
    await queue.dismissRefusal('t1');
    expect(native.outboxDismissRefusal).toHaveBeenCalledWith('t1');
  });

  it("flushes only when this rider has steps waiting, and passes the app's now", async () => {
    const {native, state, queue} = setup(null);
    expect(await queue.flush('r1', {now: true})).toEqual(new Map());
    expect(native.outboxFlush).not.toHaveBeenCalled();

    state.entries = [entry('e1')];
    await queue.dismissRefusal('none'); // reads the state again
    await queue.flush('r1', {now: true});
    expect(JSON.parse(native.outboxFlush.mock.calls[0][0])).toEqual({riderId: 'r1', now: true, accessToken: null, apiBaseUrl: 'https://api.craves.in'});
  });

  it('moves the JS queue in and reads the outbox again', async () => {
    const {native, state, queue} = setup();
    state.entries = [entry('e1')];
    await queue.importAll([entry('e1', {body: {method: 'OTP', otp: '4831'}})], []);
    expect(JSON.parse(native.outboxImport.mock.calls[0][0]).entries[0].body).toEqual({method: 'OTP', otp: '4831'});
    expect(await queue.pending('r1')).toBe(1);
  });
});
