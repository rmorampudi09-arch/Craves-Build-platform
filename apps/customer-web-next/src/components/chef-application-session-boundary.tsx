"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { Fragment, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { ChefHat, RefreshCw } from "lucide-react";
import { Spinner } from "@/components/chef-onboarding-ui";
import {
  AuthenticationRequiredError,
  captureSessionContext,
  getSession,
  isSessionReady,
  loadSession,
  subscribeSession,
} from "@/services/auth/cravesAuth";
import "@/styles/chef-onboarding.css";

// Signed-in chefs never see the sign-in popup, so its phone/OTP code loads only when needed.
const AuthModal = dynamic(() => import("@/components/auth/AuthModal").then((module) => module.AuthModal), { ssr: false });

function sessionScope() {
  const context = captureSessionContext();
  return JSON.stringify([context.generation, context.identityId, isSessionReady()]);
}
const serverScope = () => "server";
type Check = { scope: string; state: "ready" | "unavailable" | "signed-out" };

/**
 * Applicants need a current account, not an already-approved CHEF role.
 * A signed-out visitor who chose “Become a chef” gets the existing Craves phone sign-up popup
 * locked to the Home Chef role, so no customer registration is required first.
 */
export function ChefApplicationSessionBoundary({
  children,
  authMode = "register",
  returnTo = "/chef/application",
}: {
  children: ReactNode;
  authMode?: "register" | "login";
  returnTo?: string;
}) {
  const scope = useSyncExternalStore(subscribeSession, sessionScope, serverScope);
  const [attempt, setAttempt] = useState(0);
  const [check, setCheck] = useState<Check>({ scope: "", state: "unavailable" });
  const [authOpen, setAuthOpen] = useState(true);
  const [mode, setMode] = useState<"register" | "login">(authMode);
  useEffect(() => {
    let active = true;
    const timeout = window.setTimeout(() => {
      if (active) {
        active = false;
        setCheck({ scope, state: "unavailable" });
      }
    }, 15_000);
    void loadSession({ hydrateCustomerProfile: "background", failFastUnauthenticated: true })
      .then((user) => {
        if (active)
          setCheck({
            scope: sessionScope(),
            state:
              user && isSessionReady() && getSession()?.id === user.id ? "ready" : "unavailable",
          });
      })
      .catch((failure) => {
        if (active)
          setCheck({
            scope,
            state: failure instanceof AuthenticationRequiredError ? "signed-out" : "unavailable",
          });
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
  const settled = check.scope === scope;
  const signedOut = settled && check.state === "signed-out";
  const unavailable = settled && check.state === "unavailable";
  const retry = () => {
    setCheck({ scope: "", state: "unavailable" });
    setAttempt((value) => value + 1);
  };
  return (
    <>
      <section className="cob cob-page-state" aria-busy={!settled}>
        <span className="cob-icon-well cob-icon-well--round">
          {!settled ? <Spinner red /> : <ChefHat size={20} aria-hidden="true" />}
        </span>
        <h2>
          {signedOut
            ? "Become a Craves home chef"
            : unavailable
              ? "We couldn’t open your application"
              : "Opening your chef application…"}
        </h2>
        <p role="status">
          {signedOut
            ? "Verify your mobile number to start your application. Your progress is saved as you go."
            : unavailable
              ? "Check your connection and try again. If your session has ended, sign in to continue."
              : "Checking your sign-in before loading your saved details."}
        </p>
        {unavailable ? (
          <div className="cob-page-actions">
            <button type="button" className="cob-primary" onClick={retry}>
              <RefreshCw size={18} aria-hidden="true" />
              Try again
            </button>
            <Link href={`/sign-in?returnTo=${returnTo}`} className="cob-secondary">
              Sign in
            </Link>
          </div>
        ) : null}
        {signedOut ? (
          <div className="cob-page-actions">
            <button
              type="button"
              className="cob-primary"
              onClick={() => {
                setMode(authMode);
                setAuthOpen(true);
              }}
            >
              {authMode === "login" ? "Sign in with mobile number" : "Continue with mobile number"}
            </button>
            <Link href="/" className="cob-link cob-link--ink cob-link--center">
              Back to Craves
            </Link>
          </div>
        ) : null}
      </section>
      {signedOut ? <AuthModal
        open={authOpen}
        mode={mode}
        initialAccountMode="chef"
        lockAccountMode
        onSwitchMode={setMode}
        onClose={() => setAuthOpen(false)}
        onAuthenticated={() => retry()}
      /> : null}
    </>
  );
}
