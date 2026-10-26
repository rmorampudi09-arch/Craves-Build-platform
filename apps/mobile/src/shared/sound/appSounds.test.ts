import AsyncStorage from '@react-native-async-storage/async-storage';
import {createAudioPlayer} from 'expo-audio';
import {appSounds} from './appSounds';

const created = createAudioPlayer as jest.Mock;

// Players are cached per sound, so count plays across every player made so far.
function plays(): number {
  return created.mock.results.reduce(
    (total, result) => total + result.value.play.mock.calls.length,
    0,
  );
}

async function playsDuring(run: () => Promise<void>): Promise<number> {
  const before = plays();
  await run();
  return plays() - before;
}

describe('appSounds', () => {
  it('stays silent on the first status and on waiting steps, then dings once per new step', async () => {
    expect(await playsDuring(() => appSounds.orderStatusSeen('order:a', 'PAID', 100_000))).toBe(0);
    expect(
      await playsDuring(() =>
        appSounds.orderStatusSeen('order:a', 'CHEF_ACCEPTANCE_PENDING', 110_000),
      ),
    ).toBe(0);
    expect(
      await playsDuring(() => appSounds.orderStatusSeen('order:a', 'CHEF_ACCEPTED', 120_000)),
    ).toBe(1);
    expect(
      await playsDuring(() => appSounds.orderStatusSeen('order:a', 'CHEF_ACCEPTED', 160_000)),
    ).toBe(0);
  });

  it('dings once when an order and its delivery move together', async () => {
    await appSounds.orderStatusSeen('order:b', 'READY_FOR_PICKUP', 200_000);
    await appSounds.orderStatusSeen('delivery:b', 'AT_PICKUP', 200_000);
    expect(
      await playsDuring(async () => {
        await appSounds.orderStatusSeen('order:b', 'OUT_FOR_DELIVERY', 300_000);
        await appSounds.orderStatusSeen('delivery:b', 'PICKED_UP', 301_000);
      }),
    ).toBe(1);
    expect(
      await playsDuring(() => appSounds.orderStatusSeen('delivery:b', 'DELIVERED', 400_000)),
    ).toBe(1);
  });

  it('plays the notice sound only when the unread count goes up', async () => {
    expect(await playsDuring(() => appSounds.unreadCountSeen('customer-1', 3))).toBe(0);
    expect(await playsDuring(() => appSounds.unreadCountSeen('customer-1', 3))).toBe(0);
    expect(await playsDuring(() => appSounds.unreadCountSeen('customer-1', 0))).toBe(0);
    expect(await playsDuring(() => appSounds.unreadCountSeen('customer-1', 1))).toBe(1);
  });

  it('rings for a waiting chef order this run has not seen, never on the first load', async () => {
    const waiting = {id: 'x', status: 'CHEF_ACCEPTANCE_PENDING'};
    expect(await playsDuring(() => appSounds.chefOrdersSeen('chef-1', [waiting]))).toBe(0);
    expect(await playsDuring(() => appSounds.chefOrdersSeen('chef-1', [waiting]))).toBe(0);
    expect(
      await playsDuring(() =>
        appSounds.chefOrdersSeen('chef-1', [waiting, {id: 'y', status: 'CHEF_ACCEPTANCE_PENDING'}]),
      ),
    ).toBe(1);
    expect(
      await playsDuring(() =>
        appSounds.chefOrdersSeen('chef-1', [
          {id: 'y', status: 'CHEF_ACCEPTED'},
          {id: 'z', status: 'PREPARING'},
        ]),
      ),
    ).toBe(0);
    expect(await playsDuring(() => appSounds.chefOrdersSeen('chef-2', [waiting]))).toBe(0);
  });

  it('plays nothing while the Sounds switch is off and remembers the choice', async () => {
    await appSounds.setEnabled(false);
    expect(AsyncStorage.setItem).toHaveBeenLastCalledWith('craves:sounds-enabled:v1', 'off');
    expect(await playsDuring(() => appSounds.play('addToCart'))).toBe(0);

    await appSounds.setEnabled(true);
    expect(AsyncStorage.setItem).toHaveBeenLastCalledWith('craves:sounds-enabled:v1', 'on');
    expect(await playsDuring(() => appSounds.play('addToCart'))).toBe(1);
  });
});
