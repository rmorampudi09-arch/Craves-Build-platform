import React from 'react';
import {useChefToast} from '../../chefShell/components/ui';
import type {ChefMenuModel} from './useChefMenuModel';

/**
 * The on/off switch of a dish, the same on the list and on the dish page: it changes at once,
 * says "<dish> is off" with Undo for a few seconds, and says so when the server did not save it.
 */
export function useDishSwitch(updateAvailability: ChefMenuModel['updateAvailability']) {
  const toast = useChefToast();
  const inFlight = React.useRef(new Set<string>());

  return React.useCallback(
    async function setOn(dish: {id: string; itemName: string}, on: boolean, withUndo = true): Promise<void> {
      if (inFlight.current.has(dish.id)) {
        return;
      }
      inFlight.current.add(dish.id);
      try {
        const saved = await updateAvailability(dish.id, on);
        toast.show(
          saved ? `${dish.itemName} is ${on ? 'on' : 'off'}` : `We couldn't update ${dish.itemName}. Try again.`,
          saved && withUndo ? {label: 'Undo', onPress: () => setOn(dish, !on, false)} : undefined,
        );
      } finally {
        inFlight.current.delete(dish.id);
      }
    },
    [toast, updateAvailability],
  );
}
