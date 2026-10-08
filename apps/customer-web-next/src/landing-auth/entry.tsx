import { useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import AuthModal, { type VerificationRequest, type VerifyCodeRequest } from "./AuthModal";
import { beginMsg91PhoneSignIn, parkMsg91Captcha, type PhoneConfirmation } from "@/lib/msg91-browser";
import { phoneCodeRequestError } from "@/lib/phone-auth-errors";
import type { CravesIdentity } from "@/lib/auth-contract";
import { parseCustomerProfile } from "@/lib/profile-contract";
import {
  captureSessionContext,
  isSessionContextCurrent,
  isSessionReady,
  loadSession,
  setSessionIdentity,
  setSessionProfile,
  subscribeSession,
} from "@/services/auth/cravesAuth";

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let opening = false;

function sameRequest(left: VerificationRequest | null, right: VerificationRequest) {
  return left?.phone === right.phone && left.mode === right.mode && left.role === right.role;
}

function CustomerAuth({ onClose }: { onClose: () => void }) {
  const confirmation = useRef<PhoneConfirmation | null>(null);
  const requested = useRef<VerificationRequest | null>(null);
  const attempt = useRef(0);
  const watched = useRef(captureSessionContext());
  const ownIdentityInstall = useRef(false);

  useEffect(() => {
    const unsubscribe = subscribeSession(() => {
      if (isSessionContextCurrent(watched.current)) return;
      watched.current = captureSessionContext();
      if (ownIdentityInstall.current) return;
      attempt.current += 1;
      confirmation.current = null;
      requested.current = null;
      onClose();
    });
    return () => {
      unsubscribe();
      attempt.current += 1;
      confirmation.current = null;
      parkMsg91Captcha();
    };
  }, [onClose]);

  async function requestCode(request: VerificationRequest, signal: AbortSignal) {
    const sequence = ++attempt.current;
    const context = captureSessionContext();
    const current = () => !signal.aborted && attempt.current === sequence && isSessionContextCurrent(context);
    try {
      if (confirmation.current?.resend && sameRequest(requested.current, request)) {
        await confirmation.current.resend();
      } else {
        confirmation.current = null;
        requested.current = null;
        const next = await beginMsg91PhoneSignIn(request.phone, "craves-recaptcha", current);
        if (!current()) throw new Error("Phone verification was cancelled. Please try again.");
        if (!next) throw new Error("Phone verification is temporarily unavailable. Please try again.");
        confirmation.current = next;
        requested.current = request;
      }
      if (!current()) throw new Error("Phone verification was cancelled. Please try again.");
    } catch (error) {
      if (current()) throw new Error(phoneCodeRequestError(error));
      throw error;
    }
  }

  async function verifyCode(request: VerifyCodeRequest, signal: AbortSignal) {
    if (!confirmation.current || !sameRequest(requested.current, request)) {
      throw new Error("Request a verification code for this number first.");
    }
    const sequence = ++attempt.current;
    let context = captureSessionContext();
    const current = () => !signal.aborted && attempt.current === sequence && isSessionContextCurrent(context);
    const ensureCurrent = () => {
      if (!current()) throw new Error("Phone verification was cancelled. Please try again.");
    };
    const credential = await confirmation.current.confirm(request.code, current);
    ensureCurrent();
    const firebaseIdToken = await credential.user.getIdToken(true);
    ensureCurrent();
    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      signal,
      body: JSON.stringify({ firebaseIdToken }),
    });
    const body = await response.json().catch(() => null) as { identity?: CravesIdentity; message?: string } | null;
    ensureCurrent();
    if (!response.ok || !body?.identity) throw new Error(body?.message ?? "Sign-in failed. Please try again.");
    ownIdentityInstall.current = true;
    let user;
    try { user = setSessionIdentity(body.identity); }
    finally { ownIdentityInstall.current = false; }
    context = captureSessionContext();
    watched.current = context;

    if (request.mode === "sign-up" && request.role === "customer") {
      const profileResponse = await fetch("/api/customer/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        signal,
        body: JSON.stringify({ firstName: request.firstName?.trim(), lastName: request.lastName?.trim() }),
      });
      const profileBody = await profileResponse.json().catch(() => null);
      ensureCurrent();
      if (!profileResponse.ok) throw new Error("Your phone was verified, but your profile could not be saved. Please try again.");
      const profile = parseCustomerProfile(profileBody);
      if (!profile) throw new Error("Craves returned an invalid profile response. Please try again.");
      user = setSessionProfile(profile, context) ?? user;
    } else {
      user = (await loadSession()) ?? user;
    }
    ensureCurrent();
    if (!isSessionReady()) throw new Error("Your session is not ready. Please try again.");
    const destination = request.role === "chef"
      ? user.roles.some((role) => role.toUpperCase() === "CHEF") ? "/chef" : "/chef/application"
      : "/home";
    // The standalone document must load the application; role choice never grants Chef permission.
    window.location.assign(destination);
  }

  return <AuthModal onClose={onClose} onRequestCode={requestCode} onVerifyCode={verifyCode} />;
}

/** The supplied landing popup uses the application's existing MSG91/session flow. */
export async function openLandingAuth() {
  if (root || opening) return;
  opening = true;
  const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const current = await Promise.race([
      loadSession({ hydrateCustomerProfile: "background" }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Sign-in took too long to open.")), 15000); }),
    ]).catch(() => null).finally(() => clearTimeout(timer));
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    if (current) { window.location.assign("/home"); return; }
    host = document.createElement("div");
    host.id = "craves-customer-auth";
    document.body.append(host);
    root = createRoot(host);
    const close = () => {
      queueMicrotask(() => {
        root?.unmount(); root = null;
        host?.remove(); host = null;
        trigger?.focus({ preventScroll: true });
      });
    };
    root.render(<CustomerAuth onClose={close} />);
  } finally { opening = false; }
}
