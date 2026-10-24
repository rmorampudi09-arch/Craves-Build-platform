import type {ChefKitchenProfile} from '../api/chefProfileApi';
import {chefAvatarGateStep} from './chefAvatarGate';

const kitchen = (overrides: Partial<ChefKitchenProfile> = {}): ChefKitchenProfile => ({
  id: '11111111-1111-4111-8111-111111111111',
  identityId: '22222222-2222-4222-8222-222222222222',
  kitchenName: 'Relangi mavayya kitchen',
  displayName: 'Relangi',
  description: null,
  phoneNumber: null,
  email: null,
  addressLine1: '5-67, Lane 16, KPHB',
  addressLine2: null,
  landmark: null,
  areaName: 'KPHB',
  city: 'Hyderabad',
  state: 'Telangana',
  postalCode: '500085',
  latitude: null,
  longitude: null,
  status: 'ACTIVE',
  createdAt: '2026-08-01T07:00:00Z',
  updatedAt: '2026-08-09T08:00:00Z',
  ...overrides,
});

describe('chefAvatarGateStep', () => {
  it.each([
    ['loading', {status: 'pending', kitchen: null, dismissed: false}, 'wait'],
    ['kitchen failed to load', {status: 'error', kitchen: null, dismissed: false}, 'open'],
    ['no face, active', {status: 'success', kitchen: kitchen({chefPhotoUrl: null, status: 'ACTIVE'}), dismissed: false}, 'ask'],
    ['no face, draft (just approved)', {status: 'success', kitchen: kitchen({chefPhotoUrl: null, status: 'DRAFT'}), dismissed: false}, 'ask'],
    ['no face, suspended', {status: 'success', kitchen: kitchen({chefPhotoUrl: null, status: 'SUSPENDED'}), dismissed: false}, 'open'],
    ['older server, field missing', {status: 'success', kitchen: kitchen({chefPhotoUrl: undefined}), dismissed: false}, 'open'],
    [
      'has a face',
      {status: 'success', kitchen: kitchen({chefPhotoUrl: 'https://m/public/chef-avatars/chef-avatar-01.jpg'}), dismissed: false},
      'open',
    ],
    ['chef chose Not now', {status: 'success', kitchen: kitchen({chefPhotoUrl: null}), dismissed: true}, 'open'],
    ['loaded but no kitchen', {status: 'success', kitchen: null, dismissed: false}, 'open'],
    ['reload failed, face still missing', {status: 'error', kitchen: kitchen({chefPhotoUrl: null}), dismissed: false}, 'open'],
  ])('%s', (_, input, step) => expect(chefAvatarGateStep(input as never)).toBe(step));
});
