"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  ConfirmationResult,
  RecaptchaVerifier,
  signInWithPhoneNumber
} from "firebase/auth";
import { getFirebaseClient } from "../lib/firebase";

type ExchangeResponse = {
  tokenType?: string;
  accessToken?: string;
  expiresIn?: number;
  refreshToken?: string;
  refreshTokenExpiresAt?: string;
  identity?: {
    id?: string;
    firebaseUid?: string;
    phoneNumber?: string;
    email?: string | null;
    emailVerified?: boolean;
    displayName?: string | null;
    status?: string;
    roles?: string[];
    lastLoginAt?: string;
  };
  code?: string;
  message?: string;
};

type StatusType = "idle" | "ok" | "error";

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function authBaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_CRAVES_AUTH_BASE_URL;
  if (!value) {
    throw new Error("NEXT_PUBLIC_CRAVES_AUTH_BASE_URL is missing in .env.local");
  }
  return value.replace(/\/$/, "");
}

export default function FirebaseAuthTestPage() {
  const [phoneNumber, setPhoneNumber] = useState("+91");
  const [otp, setOtp] = useState("");
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [firebaseIdToken, setFirebaseIdToken] = useState("");
  const [cravesAccessToken, setCravesAccessToken] = useState("");
  const [cravesRefreshToken, setCravesRefreshToken] = useState("");
  const [exchangeResponse, setExchangeResponse] = useState<ExchangeResponse | null>(null);
  const [meResponse, setMeResponse] = useState<unknown>(null);
  const [status, setStatus] = useState<{ type: StatusType; message: string }>({ type: "idle", message: "Ready." });
  const [busy, setBusy] = useState(false);

  const baseUrl = useMemo(() => {
    try {
      return authBaseUrl();
    } catch {
      return "";
    }
  }, []);

  async function ensureRecaptcha(auth: ReturnType<typeof getFirebaseClient>["auth"]): Promise<RecaptchaVerifier> {
    const windowWithVerifier = window as typeof window & { cravesRecaptchaVerifier?: RecaptchaVerifier };
    if (windowWithVerifier.cravesRecaptchaVerifier) {
      return windowWithVerifier.cravesRecaptchaVerifier;
    }

    const verifier = new RecaptchaVerifier(auth, "recaptcha-container", {
      size: "normal",
      callback: () => {
        setStatus({ type: "ok", message: "reCAPTCHA verified. You can send OTP now." });
      },
      "expired-callback": () => {
        setStatus({ type: "error", message: "reCAPTCHA expired. Refresh the page and try again." });
      }
    });

    await verifier.render();
    windowWithVerifier.cravesRecaptchaVerifier = verifier;
    return verifier;
  }

  async function sendOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus({ type: "idle", message: "Sending OTP through Firebase Phone Auth..." });
    try {
      const { auth } = getFirebaseClient();
      const verifier = await ensureRecaptcha(auth);
      const result = await signInWithPhoneNumber(auth, phoneNumber.trim(), verifier);
      setConfirmationResult(result);
      setStatus({ type: "ok", message: "OTP sent. Enter the OTP and click Verify OTP." });
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Failed to send OTP." });
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    if (!confirmationResult) {
      setStatus({ type: "error", message: "Send OTP first." });
      return;
    }
    setBusy(true);
    setStatus({ type: "idle", message: "Verifying OTP and reading Firebase ID token..." });
    try {
      const credential = await confirmationResult.confirm(otp.trim());
      const idToken = await credential.user.getIdToken(true);
      setFirebaseIdToken(idToken);
      setStatus({ type: "ok", message: "Firebase OTP verified. Firebase ID token is ready." });
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Failed to verify OTP." });
    } finally {
      setBusy(false);
    }
  }

  async function exchangeWithCraves() {
    if (!firebaseIdToken) {
      setStatus({ type: "error", message: "Verify Firebase OTP first." });
      return;
    }
    setBusy(true);
    setStatus({ type: "idle", message: "Exchanging Firebase ID token with Craves Auth Service through APIM..." });
    try {
      const response = await fetch(`${authBaseUrl()}/firebase/exchange`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ firebaseIdToken })
      });
      const json = (await response.json()) as ExchangeResponse;
      setExchangeResponse(json);
      if (!response.ok) {
        setStatus({ type: "error", message: `Craves exchange failed: ${json.code ?? response.status} ${json.message ?? ""}` });
        return;
      }
      setCravesAccessToken(json.accessToken ?? "");
      setCravesRefreshToken(json.refreshToken ?? "");
      setStatus({ type: "ok", message: "Craves access token and refresh token received." });
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Failed to exchange with Craves Auth Service." });
    } finally {
      setBusy(false);
    }
  }

  async function testMe() {
    if (!cravesAccessToken) {
      setStatus({ type: "error", message: "Exchange with Craves first to get access token." });
      return;
    }
    setBusy(true);
    setStatus({ type: "idle", message: "Calling /me with Craves access token..." });
    try {
      const response = await fetch(`${authBaseUrl()}/me`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${cravesAccessToken}`
        }
      });
      const json = await response.json();
      setMeResponse(json);
      setStatus(response.ok
        ? { type: "ok", message: "/me returned current Craves identity." }
        : { type: "error", message: `/me failed with HTTP ${response.status}.` }
      );
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Failed to call /me." });
    } finally {
      setBusy(false);
    }
  }

  function copyAccessToken() {
    if (!cravesAccessToken) {
      return;
    }
    void navigator.clipboard.writeText(cravesAccessToken);
    setStatus({ type: "ok", message: "Craves access token copied to clipboard." });
  }

  return (
    <main>
      <section className="header">
        <div className="kicker">Craves Developer Test</div>
        <h1>Firebase Phone OTP → Craves Auth v1</h1>
        <p className="lead">
          This page verifies the complete login path: Firebase phone OTP creates a Firebase ID token,
          then Craves Auth exchanges that token for Craves access and refresh tokens through Azure API Management.
        </p>
      </section>

      <section className="grid">
        <div className="card">
          <h2>1. Verify phone OTP</h2>
          <form onSubmit={sendOtp}>
            <div className="field">
              <label htmlFor="phoneNumber">Phone number in E.164 format</label>
              <input
                id="phoneNumber"
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                placeholder="+919876543210"
                autoComplete="tel"
              />
              <p className="small">Use a Firebase test phone number first to avoid real SMS cost during development.</p>
            </div>
            <div id="recaptcha-container" />
            <div className="button-row">
              <button type="submit" disabled={busy}>Send OTP</button>
            </div>
          </form>

          <div className="field">
            <label htmlFor="otp">OTP</label>
            <input
              id="otp"
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
              placeholder="123456"
              inputMode="numeric"
            />
          </div>

          <div className="button-row">
            <button type="button" onClick={verifyOtp} disabled={busy || !confirmationResult}>Verify OTP</button>
            <button type="button" onClick={exchangeWithCraves} disabled={busy || !firebaseIdToken}>Exchange with Craves</button>
            <button type="button" className="secondary" onClick={testMe} disabled={busy || !cravesAccessToken}>Test /me</button>
          </div>

          <div className={`status ${status.type === "ok" ? "ok" : status.type === "error" ? "error" : ""}`}>
            {status.message}
          </div>
        </div>

        <aside className="card">
          <h2>Setup checklist</h2>
          <ol className="step-list">
            <li>Firebase Phone provider must be enabled.</li>
            <li>Use a Firebase test phone number first.</li>
            <li>Authorized domain must include localhost for local testing.</li>
            <li>APIM auth base URL must point to /api/v1/auth.</li>
          </ol>
          <p className="small">Current configured Auth URL:</p>
          <div className="code">{baseUrl || "NEXT_PUBLIC_CRAVES_AUTH_BASE_URL missing"}</div>
        </aside>
      </section>

      <section className="grid" style={{ marginTop: 20 }}>
        <div className="card">
          <h2>2. Token results</h2>
          <div className="field">
            <label>Firebase ID token</label>
            <textarea readOnly value={firebaseIdToken} placeholder="Firebase ID token appears here after OTP verification." />
          </div>
          <div className="field">
            <label>Craves access token</label>
            <textarea readOnly value={cravesAccessToken} placeholder="Craves access token appears here after exchange." />
          </div>
          <div className="button-row">
            <button type="button" className="secondary" onClick={copyAccessToken} disabled={!cravesAccessToken}>Copy access token</button>
          </div>
          <div className="field">
            <label>Craves refresh token</label>
            <textarea readOnly value={cravesRefreshToken} placeholder="Craves refresh token appears here after exchange." />
          </div>
        </div>

        <div className="card">
          <h2>3. API responses</h2>
          <p className="small">Exchange response</p>
          <pre className="code">{exchangeResponse ? formatJson(exchangeResponse) : "No exchange response yet."}</pre>
          <p className="small">/me response</p>
          <pre className="code">{meResponse ? formatJson(meResponse) : "No /me response yet."}</pre>
        </div>
      </section>
    </main>
  );
}
