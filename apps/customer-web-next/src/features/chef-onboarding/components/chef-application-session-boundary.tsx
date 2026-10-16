"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ChefHat, RefreshCw } from "lucide-react";
import { messages } from "@/shared/i18n/language";
import { useText } from "@/shared/i18n/language-context";
import { Spinner } from "@/features/chef-onboarding/components/chef-onboarding-ui";
import { enterChefMode, isChefModeVerified } from "@/features/chef/lib/chef-mode";
import {
  AuthenticationRequiredError,
  captureSessionContext,
  getSession,
  isSessionReady,
  loadSession,
  subscribeSession,
} from "@/features/auth/api/cravesAuth";
import "@/features/chef-onboarding/styles/chef-onboarding.css";

function sessionScope() {
  const context = captureSessionContext();
  return JSON.stringify([context.generation, context.identityId, isSessionReady()]);
}
const serverScope = () => "server";
type Check = { scope: string; state: "ready" | "unavailable"; signInHref?: string };

const TEXT = messages({
  en: {
    failed: "We couldn’t open your application",
    opening: "Opening your application",
    failedText: "Check your connection and try again. If your session has ended, sign in to continue.",
    loading: "Loading your saved details…",
    tryAgain: "Try again",
    signIn: "Sign in",
  },
  te: {
    failed: "మీ దరఖాస్తు తెరవలేకపోయాం",
    opening: "మీ దరఖాస్తు తెరుస్తున్నాం",
    failedText: "ఇంటర్నెట్ చూసుకుని మళ్లీ ప్రయత్నించండి. మీ సైన్ ఇన్ ముగిసి ఉంటే, కొనసాగడానికి సైన్ ఇన్ చేయండి.",
    loading: "సేవ్ చేసిన మీ వివరాలు లోడ్ అవుతున్నాయి…",
    tryAgain: "మళ్లీ ప్రయత్నించండి",
    signIn: "సైన్ ఇన్",
  },
  kn: {
    failed: "ನಿಮ್ಮ ಅರ್ಜಿ ತೆರೆಯಲು ಆಗಲಿಲ್ಲ",
    opening: "ನಿಮ್ಮ ಅರ್ಜಿ ತೆರೆಯುತ್ತಿದೆ",
    failedText: "ಇಂಟರ್ನೆಟ್ ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ. ನಿಮ್ಮ ಸೈನ್ ಇನ್ ಮುಗಿದಿದ್ದರೆ, ಮುಂದುವರಿಸಲು ಸೈನ್ ಇನ್ ಮಾಡಿ.",
    loading: "ಉಳಿಸಿದ ನಿಮ್ಮ ವಿವರಗಳು ಲೋಡ್ ಆಗುತ್ತಿವೆ…",
    tryAgain: "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ",
    signIn: "ಸೈನ್ ಇನ್",
  },
});

/**
 * Applicant pages need a current account whose device (or tab) confirmed Chef Mode with a phone OTP,
 * not an approved CHEF role. Anyone else goes to /chef/sign-in and comes back here afterwards.
 */
export function ChefApplicationSessionBoundary({ children }: { children: ReactNode }) {
  const text = useText(TEXT);
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
          if (!isChefModeVerified(user.id)) return signIn();
          enterChefMode(user.id);
          setCheck({ scope: sessionScope(), state: "ready" });
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
      <span className={`cob-icon-well cob-icon-well--round${unavailable ? " cob-icon-well--neutral" : ""}`}>
        {unavailable ? <ChefHat size={20} aria-hidden="true" /> : <Spinner red />}
      </span>
      <h2>{unavailable ? text.failed : text.opening}</h2>
      <p role="status">{unavailable ? text.failedText : text.loading}</p>
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
            {text.tryAgain}
          </button>
          {check.signInHref ? (
            <Link href={check.signInHref} className="cob-secondary">
              {text.signIn}
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
