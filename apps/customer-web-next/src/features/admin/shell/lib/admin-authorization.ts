import type { AdminIdentity } from "./admin-contract.ts";
import type { SessionState } from "./admin-renewal.ts";

export type AdminAuthorization = {
  identity: AdminIdentity | null;
  message: string;
  sessionState: SessionState;
};

export const INITIAL_ADMIN_AUTHORIZATION: AdminAuthorization = {
  identity: null,
  message: "Verifying administrator access…",
  sessionState: "checking",
};

/** Recheck live authorization without interrupting an already verified workspace. */
export function createAdminAuthorization(deps: {
  loadIdentity: () => Promise<AdminIdentity>;
  publish: (state: AdminAuthorization) => void;
  closeDialogs: () => void;
}) {
  let snapshot = INITIAL_ADMIN_AUTHORIZATION;
  let generation = 0;
  let disposed = false;
  let ended = false;
  const publish = (next: AdminAuthorization) => { snapshot = next; deps.publish(next); };

  async function accept(state: SessionState): Promise<void> {
    if (disposed || ended) return;
    const started = ++generation;
    if (state === "ended") {
      ended = true;
      deps.closeDialogs();
      publish({ identity: null, sessionState: state, message: "Your administrator session has ended. Please sign in again." });
      return;
    }
    if (state !== "ready") {
      deps.closeDialogs();
      publish({ ...snapshot, sessionState: state, message: state === "reconnecting"
        ? "Reconnecting securely. Your open workspace is kept in this tab."
        : "Verifying administrator access…" });
      return;
    }

    // A successful periodic session check does not invalidate a verified identity.
    // Actual reconnects and failed identity checks still hide the workspace.
    if (snapshot.sessionState !== "ready" || !snapshot.identity) {
      publish({ ...snapshot, sessionState: state, message: "Verifying administrator access…" });
    }
    try {
      const identity = await deps.loadIdentity();
      if (disposed || ended || started !== generation) return;
      if (!identity.adminEnabled || identity.status !== "ACTIVE") throw new Error("This account does not have administrator access.");
      publish({ identity, sessionState: state, message: "" });
    } catch (error) {
      if (disposed || ended || started !== generation) return;
      deps.closeDialogs();
      publish({ identity: null, sessionState: state,
        message: error instanceof Error ? error.message : "Administrator access is unavailable." });
    }
  }

  return { accept, dispose: () => { disposed = true; generation++; } };
}
