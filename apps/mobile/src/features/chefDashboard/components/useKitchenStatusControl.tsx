import React from 'react';
import {InteractionManager} from 'react-native';
import {ConfirmDialog, useChefToast} from '../../chefShell/components/ui';
import type {KitchenOpenState, KitchenPauseDuration} from '../../chefProfile/state/useKitchenOpenState';
import {KitchenStatusSheet} from './KitchenStatusSheet';

export const KITCHEN_UPDATE_FAILED = "We couldn't update your kitchen. Check your connection and try again.";

export interface KitchenStatusControl {
  /** Opens the Kitchen status sheet. */
  openSheet: () => void;
  /** Opens the kitchen for orders, with a toast. For a button outside the sheet. */
  open: () => Promise<void>;
  /** Takes orders again after a pause, with a toast. For a button outside the sheet. */
  resume: () => Promise<void>;
  /** The Kitchen status sheet and the "Close your kitchen?" dialog. Render them once, anywhere in the screen. */
  dialogs: React.ReactNode;
}

/**
 * Everything the chef does to the kitchen's open state, for every screen that offers it (Home, the empty New list):
 * the status sheet, closing with a question when orders are still cooking, and the toasts that say what happened.
 * `cookingCount` is the orders being cooked now (accepted and preparing; not the ones already packed and waiting).
 */
export function useKitchenStatusControl(
  kitchen: KitchenOpenState,
  cookingCount: number,
  onChangeHours: () => void,
): KitchenStatusControl {
  const toast = useChefToast();
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [confirmClose, setConfirmClose] = React.useState(false);

  // Two Modals swapping in one tick (or a page opening under a closing sheet) misbehave on Android:
  // close the sheet first, and run what comes next once it is gone and its animation has finished.
  const afterSheetClosed = React.useRef<(() => void) | null>(null);
  const closeSheetThen = (next: () => void) => {
    afterSheetClosed.current = next;
    setSheetOpen(false);
  };
  React.useEffect(() => {
    if (sheetOpen || !afterSheetClosed.current) {
      return undefined;
    }
    const next = afterSheetClosed.current;
    afterSheetClosed.current = null;
    const task = InteractionManager.runAfterInteractions(next);
    return () => task.cancel();
  }, [sheetOpen]);

  const change = async (action: () => Promise<boolean>, done: string) => {
    setSheetOpen(false);
    try {
      // false: another save was still running and this press did nothing, so there is nothing to announce.
      if (await action()) {
        toast.show(done);
      }
    } catch {
      toast.show(KITCHEN_UPDATE_FAILED);
    }
  };
  const open = () => change(() => kitchen.setOpen(true), 'Your kitchen is open');
  const resume = () => change(() => kitchen.resume(), 'Taking orders again');
  const closeKitchen = () => change(() => kitchen.setOpen(false), 'Your kitchen is closed');
  const askToClose = () => {
    if (cookingCount > 0) {
      closeSheetThen(() => setConfirmClose(true));
    } else {
      closeKitchen().catch(() => undefined);
    }
  };

  const dialogs = (
    <>
      <KitchenStatusSheet
        busy={kitchen.saving}
        closedReason={kitchen.closedReason}
        hoursToday={kitchen.hoursToday}
        onChangeHours={() => closeSheetThen(onChangeHours)}
        onClose={() => setSheetOpen(false)}
        onCloseKitchen={askToClose}
        onOpen={() => open().catch(() => undefined)}
        onPause={(duration: KitchenPauseDuration) => {
          change(() => kitchen.pause(duration), 'New orders paused').catch(() => undefined);
        }}
        onResume={() => resume().catch(() => undefined)}
        opensAt={kitchen.opensAt}
        pauseAvailable={kitchen.pauseAvailable}
        pausedUntil={kitchen.pausedUntil}
        status={kitchen.status}
        visible={sheetOpen}
      />
      <ConfirmDialog
        cancelLabel="Keep open"
        confirmLabel="Close kitchen"
        message={`${cookingCount} ${cookingCount === 1 ? 'order is still cooking. It carries' : 'orders are still cooking. They carry'} on, but you won't get new orders until you open the kitchen again.`}
        onCancel={() => setConfirmClose(false)}
        onConfirm={() => {
          setConfirmClose(false);
          closeKitchen().catch(() => undefined);
        }}
        title="Close your kitchen?"
        tone="danger"
        visible={confirmClose}
      />
    </>
  );

  return {openSheet: () => setSheetOpen(true), open, resume, dialogs};
}
