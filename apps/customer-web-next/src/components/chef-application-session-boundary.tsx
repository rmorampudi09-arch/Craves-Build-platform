"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ChefHat, RefreshCw } from "lucide-react";
import { Spinner } from "@/components/chef-onboarding-ui";
import { isChefModeVerified } from "@/lib/chef-mode";
import {
  AuthenticationRequiredError,
  captureSessionContext,
  getSession,
  isSessionReady,
  loadSession,
  subscribeSession,
} from "@/services/auth/cravesAuth";
import "@/styles/chef-onboarding.css";

function sessionScope() {
  const context = captureSessionContext();
  return JSON.stringify([context.generation, context.identityId, isSessionReady()]);
}
const serverScope = () => "server";
type Check = { scope: string; state: "ready" | "unavailable"; signInHref?: string };

/**
 * Applicant pages need a current account that signed in to Chef Mode in this tab, not an approved
 * CHEF role. Anyone else goes to /chef/sign-in and comes back here afterwards.
 */
export function ChefApplicationSessionBoundary({ children }: { children: ReactNode }) {
  const router = useRouter();
  const navigation = useRef(router);
  useEffect(() => {
    navigation.current = router;
  }, [router]);
  const scope = useSyncExternalStore(subscribeSession, sessionScope, serverScope);
  const [attempt, setAttempt] = useState(0);
  const [check, setCheck] = useState<Check>({ scope: "", state: "unavailable" });
  useEffect(() => {
    let active = true;
    const signInHref = `/chef/sign-in?returnTo=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`;
    const signIn = () => {
      active = false;
      navigation.current.replace(signInHref);
    };
    const timeout = window.setTimeout(() => {
      if (active) {
        active = false;
        setCheck({ scope, state: "unavailable", signInHref });
      }
    }, 15_000);
    void loadSession({ hydrateCustomerProfile: "background", failFastUnauthenticated: true })
      .then((user) => {
        if (!active) return;
        if (user && isSessionReady() && getSession()?.id === user.id) {
          if (isChefModeVerified(user.id)) setCheck({ scope: sessionScope(), state: "ready" });
          else signIn();
        } else if (!user && !getSession()) signIn();
        // No identity while one is still held and not ready: a sign-out is settling and navigates on its own.
        else if (user || isSessionReady()) setCheck({ scope, state: "unavailable", signInHref });
      })
      .catch((failure) => {
        if (!active) return;
        if (failure instanceof AuthenticationRequiredError) signIn();
        else setCheck({ scope, state: "unavailable", signInHref });
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [scope, attempt]);

  if (check.scope === scope && check.state === "ready" && isSessionReady()) {
    return <Fragment key={scope}>{children}</Fragment>;
  }
  const unavailable = check.scope === scope;
  return (
    <section className="cob cob-page-state" aria-busy={!unavailable}>
      <span className="cob-icon-well cob-icon-well--neutral cob-icon-well--round">
        {unavailable ? <ChefHat size={20} aria-hidden="true" /> : <Spinner red />}
      </span>
      <h2>{unavailable ? "We couldn’t open your application" : "Opening your chef application…"}</h2>
      <p role="status">
        {unavailable
          ? "Check your connection and try again. If your session has ended, sign in to continue."
          : "Checking your sign-in before loading your saved details."}
      </p>
      {unavailable ? (
        <div className="cob-page-actions">
          <button
            type="button"
            className="cob-primary"
            onClick={() => {
              setCheck({ scope: "", state: "unavailable" });
              setAttempt((value) => value + 1);
            }}
          >
            <RefreshCw size={18} aria-hidden="true" />
            Try again
          </button>
          {check.signInHref ? (
            <Link href={check.signInHref} className="cob-secondary">
              Sign in
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
