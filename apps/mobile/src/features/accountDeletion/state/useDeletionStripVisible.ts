import {createContext, useContext} from 'react';

export const DeletionStripVisibleContext = createContext(false);

/**
 * True while the delete-request strip sits over the status bar; false outside AccountDeletionProvider.
 * A screen that sets its own status bar icon colour must use dark icons while this is true, because
 * React Native lets the last StatusBar entry win and the strip is pale amber.
 */
export function useDeletionStripVisible(): boolean {
  return useContext(DeletionStripVisibleContext);
}
