import {sessionManager} from '../../auth/api/sessionManager';

/** Pulls a fresh identity after a deletion request changes; the rotation listener updates the store. */
export async function refreshAfterDeletionChange(): Promise<void> {
  try {
    await sessionManager.refresh();
  } catch {
    // Offline is fine: the next scheduled refresh brings the change in.
  }
}
