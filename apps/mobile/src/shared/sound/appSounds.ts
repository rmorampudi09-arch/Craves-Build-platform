import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import type {AudioPlayer} from 'expo-audio';

export type AppSound =
  | 'addToCart'
  | 'orderPlaced'
  | 'orderUpdate'
  | 'newNotice'
  | 'chefNewOrder'
  | 'chefOrderDone';

/** Made in code with earshot; ids, pitches and levels are in src/assets/sounds/README.md. */
function sourceFor(sound: AppSound): number {
  switch (sound) {
    case 'addToCart':
      return require('../../assets/sounds/add-to-cart.wav');
    case 'orderPlaced':
      return require('../../assets/sounds/order-placed.wav');
    case 'orderUpdate':
      return require('../../assets/sounds/order-update.wav');
    case 'newNotice':
      return require('../../assets/sounds/new-notice.wav');
    case 'chefNewOrder':
      return require('../../assets/sounds/chef-new-order.wav');
    case 'chefOrderDone':
      return require('../../assets/sounds/chef-order-done.wav');
  }
}

const STORAGE_KEY = 'craves:sounds-enabled:v1';
// Order and delivery steps worth a ding; waiting and payment steps stay silent.
const UPDATE_STATUSES = new Set([
  'CHEF_ACCEPTED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'COURIER_ASSIGNED',
  'PICKED_UP',
  'AT_DROPOFF',
]);
const UPDATE_GAP_MS = 5_000;

let enabled = true;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const players = new Map<AppSound, AudioPlayer>();
let playing: AudioPlayer | null = null;
const heardStatus = new Map<string, string>();
let lastUpdateAt = -Infinity;
const unreadSeen = new Map<string, number>();
const chefOrdersHeard = new Map<string, Set<string>>();

function notify() {
  listeners.forEach(listener => listener());
}

function loadSetting(): Promise<void> {
  loading ??= AsyncStorage.getItem(STORAGE_KEY)
    .then(value => {
      enabled = value !== 'off';
      notify();
    })
    .catch(() => undefined);
  return loading;
}

function playerFor(sound: AppSound): AudioPlayer {
  const audio: typeof import('expo-audio') = require('expo-audio');
  let player = players.get(sound);
  if (!player) {
    if (players.size === 0) {
      // Silent or vibrate mode mutes app sounds, and music from other apps keeps playing.
      audio
        .setAudioModeAsync({playsInSilentMode: false, interruptionMode: 'mixWithOthers'})
        .catch(() => undefined);
    }
    player = audio.createAudioPlayer(sourceFor(sound));
    players.set(sound, player);
  }
  return player;
}

/** Optional sound must never block or break the action it follows. */
async function play(sound: AppSound): Promise<void> {
  try {
    await loadSetting();
    if (!enabled) return;
    const player = playerFor(sound);
    if (playing && playing !== player) playing.pause();
    playing = player;
    if (player.currentTime > 0) await player.seekTo(0);
    player.play();
  } catch {
    // Missing native module, no audio output and decoder errors are safe no-ops.
  }
}

/** A tracked order or delivery reached `status`. The first status seen for `key` is silent. */
function orderStatusSeen(key: string, status: string, now = Date.now()): Promise<void> {
  const before = heardStatus.get(key);
  heardStatus.set(key, status);
  if (before === undefined || before === status || !UPDATE_STATUSES.has(status)) {
    return Promise.resolve();
  }
  // An order and its delivery often move together: one ding for both.
  if (now - lastUpdateAt < UPDATE_GAP_MS) return Promise.resolve();
  lastUpdateAt = now;
  return play('orderUpdate');
}

/** The account's unread notice count as loaded from the server. Plays only when it goes up. */
function unreadCountSeen(identityId: string, count: number): Promise<void> {
  const before = unreadSeen.get(identityId);
  unreadSeen.set(identityId, count);
  return before !== undefined && count > before ? play('newNotice') : Promise.resolve();
}

/** The chef's order list as loaded. Rings once for orders waiting for an answer that this run has not seen. */
function chefOrdersSeen(
  identityId: string,
  orders: readonly {id: string; status: string}[],
): Promise<void> {
  const waiting = orders.filter(order => order.status === 'CHEF_ACCEPTANCE_PENDING');
  const heard = chefOrdersHeard.get(identityId);
  chefOrdersHeard.set(identityId, new Set([...(heard ?? []), ...waiting.map(order => order.id)]));
  return heard && waiting.some(order => !heard.has(order.id))
    ? play('chefNewOrder')
    : Promise.resolve();
}

async function setEnabled(on: boolean): Promise<void> {
  await loadSetting(); // a slow first read must not undo this choice
  enabled = on;
  notify();
  if (!on) playing?.pause();
  await AsyncStorage.setItem(STORAGE_KEY, on ? 'on' : 'off').catch(() => undefined);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  void loadSetting();
  return () => {
    listeners.delete(listener);
  };
}

export function useSoundsEnabled(): boolean {
  return React.useSyncExternalStore(subscribe, () => enabled);
}

export const appSounds = {play, orderStatusSeen, unreadCountSeen, chefOrdersSeen, setEnabled};
