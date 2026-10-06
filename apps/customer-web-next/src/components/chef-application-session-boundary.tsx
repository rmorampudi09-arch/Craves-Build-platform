"use client";

import Link from "next/link";
import { Fragment, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { AuthenticationRequiredError, captureSessionContext, getSession, isSessionContextCurrent, isSessionReady, loadSession, subscribeSession } from "@/services/auth/cravesAuth";

function sessionScope() {
  const context = captureSessionContext();
  return JSON.stringify([context.generation, context.identityId, isSessionReady()]);
}
const serverScope = () => "server";

/** Applicants need a current account, not an already-approved CHEF role. */
export function ChefApplicationSessionBoundary({ children }: { children: ReactNode }) {
  const scope = useSyncExternalStore(subscribeSession, sessionScope, serverScope);
  const [attempt, setAttempt] = useState(0);
  const [check, setCheck] = useState<{ scope: string; state: "ready" | "signed-out" | "unavailable" }>({ scope: "", state: "unavailable" });
  useEffect(() => {
    let active = true;
    const initial = captureSessionContext();
    const timeout = window.setTimeout(() => {
      if (active) { active = false; setCheck({ scope, state: "unavailable" }); }
    }, 15_000);
    void loadSession({ hydrateCustomerProfile: "skip", failFastUnauthenticated: true }).then(user => {
      if (initial.identityId !== null && !isSessionContextCurrent(initial)) return;
      if (active) setCheck({ scope: sessionScope(), state: user && isSessionReady() && getSession()?.id === user.id ? "ready" : "unavailable" });
    }).catch(error => {
      if (active) setCheck({ scope, state: error instanceof AuthenticationRequiredError ? "signed-out" : "unavailable" });
    }).finally(() => window.clearTimeout(timeout));
    return () => { active = false; window.clearTimeout(timeout); };
  }, [scope, attempt]);

  if (check.scope === scope && check.state === "ready" && isSessionReady()) {
    return <Fragment key={scope}>{children}</Fragment>;
  }
  const signedOut = check.scope === scope && check.state === "signed-out";
  const unavailable = check.scope === scope && check.state === "unavailable";
  return <section className="rounded-3xl border border-slate-200 bg-white p-6" aria-busy={!unavailable && !signedOut}>
    <h2 className="text-xl font-bold">{signedOut ? "Sign in to start your chef application" : unavailable ? "We couldn’t open your application" : "Opening your chef application…"}</h2>
    <p role="status" className="mt-3 text-sm text-slate-600">{signedOut ? "Sign in to create an application or continue your saved application." : unavailable ? "Check your connection and try again. If your session has ended, sign in to continue." : "Checking your sign-in before loading your saved details."}</p>
    {(unavailable || signedOut) && <div className="mt-4 flex flex-wrap gap-3">
      {unavailable && <button type="button" className="min-h-12 rounded-full border border-slate-300 px-5 font-semibold" onClick={() => { setCheck({ scope: "", state: "unavailable" }); setAttempt(value => value + 1); }}>Try again</button>}
      <Link href="/sign-in?returnTo=/chef/application" className="inline-flex min-h-12 items-center rounded-full bg-primary px-5 font-semibold text-white">Sign in</Link>
    </div>}
  </section>;
}
