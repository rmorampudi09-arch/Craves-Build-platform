import type {ChefKitchenProfile} from '../api/chefProfileApi';
import {canEditChefKitchenProfile} from './chefEditProfileForm';

export type ChefAvatarGateStep = 'wait' | 'ask' | 'open';

/**
 * Whether the chef must pick a face before the workspace appears. Only a loaded, editable kitchen
 * whose server says "no picture" (null) asks; every other case opens the workspace so no chef is
 * ever stuck: a failed read, a suspended kitchen, an older server that omits the field, "Not now".
 */
export function chefAvatarGateStep(input: {
  status: 'pending' | 'error' | 'success';
  kitchen: ChefKitchenProfile | null;
  dismissed: boolean;
}): ChefAvatarGateStep {
  const {status, kitchen, dismissed} = input;
  if (dismissed) return 'open';
  if (status === 'pending') return 'wait';
  if (status === 'error' || !kitchen) return 'open';
  return kitchen.chefPhotoUrl === null && canEditChefKitchenProfile(kitchen) ? 'ask' : 'open';
}
