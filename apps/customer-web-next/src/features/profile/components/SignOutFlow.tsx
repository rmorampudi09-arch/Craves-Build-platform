"use client";

import { useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CustomerSignOutDialog } from "@/features/home/components/CustomerSignOutDialog";
import {
  captureSessionContext,
  clearSession,
  getSession,
  isSessionContextCurrent,
  LogoutUnconfirmedError,
  type SessionContext,
} from "@/features/auth/api/cravesAuth";

/**
 * Sign out with the confirm dialog, shared by Profile and Settings. An unconfirmed sign-out keeps the
 * person signed in and offers the retry in the dialog; a confirmed one leaves for the landing page.
 */
export function useCustomerSignOut(): { ask: () => void; dialog: ReactNode } {
  const navigate = useNavigate();
  const logoutAttempt = useRef(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [logout, setLogout] = useState<{
    context: SessionContext | null;
    busy: boolean;
    error: string;
  }>({ context: null, busy: false, error: "" });

  const currentLogout =
    logout.context !== null && isSessionContextCurrent(logout.context);

  async function signOut() {
    if (logout.busy && currentLogout) return;

    const attempt = ++logoutAttempt.current;
    const pending = clearSession();
    setLogout({
      context: captureSessionContext(),
      busy: true,
      error: "",
    });

    try {
      await pending;
      if (attempt !== logoutAttempt.current) return;
      if (!getSession()) {
        // Stay on "Signing out…" until the landing page replaces this one.
        setLeaving(true);
        navigate({ to: "/" });
      }
      setLogout({ context: null, busy: false, error: "" });
    } catch (error) {
      if (attempt !== logoutAttempt.current) return;
      if (
        !(error instanceof LogoutUnconfirmedError) ||
        !error.retryContext ||
        !isSessionContextCurrent(error.retryContext)
      ) {
        return;
      }

      setLogout({
        context: error.retryContext,
        busy: false,
        error:
          "We couldn’t confirm that you signed out, so you’re still signed in. Please try again.",
      });
    }
  }

  return {
    ask: () => setConfirmOpen(true),
    dialog: (
      <CustomerSignOutDialog
        open={confirmOpen}
        busy={leaving || (currentLogout && logout.busy)}
        error={currentLogout ? logout.error : ""}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void signOut()}
      />
    ),
  };
}
