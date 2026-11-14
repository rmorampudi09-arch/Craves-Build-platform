"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getSession, loadSession, subscribeSession } from "@/features/auth/api/cravesAuth";

/** true or false once known; null while the first check is still running. */
export function useSignedIn(): boolean | null {
  const session = useSyncExternalStore(subscribeSession, getSession, () => null);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    let live = true;
    void loadSession()
      .catch(() => null)
      .finally(() => {
        if (live) setChecked(true);
      });
    return () => {
      live = false;
    };
  }, []);
  return session ? true : checked ? false : null;
}
