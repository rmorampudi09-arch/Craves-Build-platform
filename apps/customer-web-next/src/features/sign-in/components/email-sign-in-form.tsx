"use client";

import { useRef, useState, type FormEvent } from "react";
import { Check, Eye, EyeOff } from "lucide-react";
import type { CravesIdentity } from "@/features/auth/lib/auth-contract";
import { CARD, FIELD, SECONDARY_BUTTON, TEXT_BUTTON } from "@/features/sign-in/components/auth-form-classes";
import {
  emailError,
  emailSignInErrors,
  PASSWORD_RECOVERY_NEUTRAL_MESSAGE,
  PhoneVerificationRequiredError,
  sendPasswordReset,
  signInWithEmail,
} from "@/features/sign-in/lib/email-sign-in";
import { messages } from "@/shared/i18n/language";
import { useLanguage, useText } from "@/shared/i18n/language-context";

// Chefs read this form in their language; customer pages have no language provider and read English.
const TEXT = messages({
  en: {
    sentTitle: "Password Reset Sent",
    backToLogin: "Back to login",
    welcomeBack: "Welcome back",
    forgotTitle: "Forgot your password?",
    signInIntro: "Log in with your email and password.",
    forgotIntro: "Enter the email you use for Craves. If an account matches, we will send secure reset instructions.",
    email: "Email address",
    emailPlaceholder: "Enter your email address",
    password: "Password",
    passwordPlaceholder: "Enter your password",
    hidePassword: "Hide password",
    showPassword: "Show password",
    forgot: "Forgot password?",
    opening: "Opening…",
    loggingIn: "Logging in…",
    chefLogIn: "Log in as Chef",
    sending: "Sending…",
    sendReset: "Send reset link",
    usePhone: "Use phone OTP instead",
  },
  te: {
    sentTitle: "పాస్‌వర్డ్ రీసెట్ లింక్ పంపాము",
    backToLogin: "లాగిన్‌కు తిరిగి వెళ్లండి",
    welcomeBack: "మళ్లీ స్వాగతం",
    forgotTitle: "పాస్‌వర్డ్ మర్చిపోయారా?",
    signInIntro: "మీ ఈమెయిల్, పాస్‌వర్డ్‌తో లాగిన్ అవ్వండి.",
    forgotIntro: "Craves కోసం మీరు వాడే ఈమెయిల్ ఇవ్వండి. ఆ ఈమెయిల్‌తో ఖాతా ఉంటే, పాస్‌వర్డ్ మార్చే సూచనలు పంపుతాం.",
    email: "ఈమెయిల్ చిరునామా",
    emailPlaceholder: "మీ ఈమెయిల్ చిరునామా ఇవ్వండి",
    password: "పాస్‌వర్డ్",
    passwordPlaceholder: "మీ పాస్‌వర్డ్ ఇవ్వండి",
    hidePassword: "పాస్‌వర్డ్ దాచండి",
    showPassword: "పాస్‌వర్డ్ చూపించండి",
    forgot: "పాస్‌వర్డ్ మర్చిపోయారా?",
    opening: "తెరుస్తున్నాం…",
    loggingIn: "లాగిన్ అవుతోంది…",
    chefLogIn: "చెఫ్‌గా లాగిన్ అవ్వండి",
    sending: "పంపుతున్నాం…",
    sendReset: "రీసెట్ లింక్ పంపండి",
    usePhone: "బదులుగా ఫోన్ OTP వాడండి",
  },
  kn: {
    sentTitle: "ಪಾಸ್‌ವರ್ಡ್ ರೀಸೆಟ್ ಲಿಂಕ್ ಕಳುಹಿಸಲಾಗಿದೆ",
    backToLogin: "ಲಾಗಿನ್‌ಗೆ ಹಿಂತಿರುಗಿ",
    welcomeBack: "ಮತ್ತೆ ಸ್ವಾಗತ",
    forgotTitle: "ಪಾಸ್‌ವರ್ಡ್ ಮರೆತಿದ್ದೀರಾ?",
    signInIntro: "ನಿಮ್ಮ ಇಮೇಲ್ ಮತ್ತು ಪಾಸ್‌ವರ್ಡ್‌ನಿಂದ ಲಾಗಿನ್ ಆಗಿ.",
    forgotIntro: "Craves ಗಾಗಿ ನೀವು ಬಳಸುವ ಇಮೇಲ್ ನಮೂದಿಸಿ. ಆ ಇಮೇಲ್‌ನ ಖಾತೆ ಇದ್ದರೆ, ಪಾಸ್‌ವರ್ಡ್ ಬದಲಿಸುವ ಸೂಚನೆಗಳನ್ನು ಕಳುಹಿಸುತ್ತೇವೆ.",
    email: "ಇಮೇಲ್ ವಿಳಾಸ",
    emailPlaceholder: "ನಿಮ್ಮ ಇಮೇಲ್ ವಿಳಾಸ ನಮೂದಿಸಿ",
    password: "ಪಾಸ್‌ವರ್ಡ್",
    passwordPlaceholder: "ನಿಮ್ಮ ಪಾಸ್‌ವರ್ಡ್ ನಮೂದಿಸಿ",
    hidePassword: "ಪಾಸ್‌ವರ್ಡ್ ಮರೆಮಾಡಿ",
    showPassword: "ಪಾಸ್‌ವರ್ಡ್ ತೋರಿಸಿ",
    forgot: "ಪಾಸ್‌ವರ್ಡ್ ಮರೆತಿದ್ದೀರಾ?",
    opening: "ತೆರೆಯುತ್ತಿದೆ…",
    loggingIn: "ಲಾಗಿನ್ ಆಗುತ್ತಿದೆ…",
    chefLogIn: "ಚೆಫ್ ಆಗಿ ಲಾಗಿನ್ ಆಗಿ",
    sending: "ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ…",
    sendReset: "ರೀಸೆಟ್ ಲಿಂಕ್ ಕಳುಹಿಸಿ",
    usePhone: "ಬದಲಿಗೆ ಫೋನ್ OTP ಬಳಸಿ",
  },
});

/** The email sign-in helpers' English sentences, shown in the chef's language; anything else shows as sent. */
const SENTENCES: Record<string, { te: string; kn: string }> = {
  "Enter a valid email address.": { te: "సరైన ఈమెయిల్ చిరునామా ఇవ్వండి.", kn: "ಸರಿಯಾದ ಇಮೇಲ್ ವಿಳಾಸ ನಮೂದಿಸಿ." },
  "Password must be at least 8 characters.": {
    te: "పాస్‌వర్డ్‌లో కనీసం 8 అక్షరాలు ఉండాలి.",
    kn: "ಪಾಸ್‌ವರ್ಡ್‌ನಲ್ಲಿ ಕನಿಷ್ಠ 8 ಅಕ್ಷರಗಳು ಇರಬೇಕು.",
  },
  [PASSWORD_RECOVERY_NEUTRAL_MESSAGE]: {
    te: "ఈ ఈమెయిల్‌తో Craves ఖాతా ఉంటే, త్వరలో పాస్‌వర్డ్ రీసెట్ లింక్ పంపుతాం.",
    kn: "ಈ ಇಮೇಲ್‌ಗೆ Craves ಖಾತೆ ಇದ್ದರೆ, ಶೀಘ್ರದಲ್ಲೇ ಪಾಸ್‌ವರ್ಡ್ ರೀಸೆಟ್ ಲಿಂಕ್ ಕಳುಹಿಸುತ್ತೇವೆ.",
  },
  "The email or password is incorrect.": { te: "ఈమెయిల్ లేదా పాస్‌వర్డ్ తప్పు.", kn: "ಇಮೇಲ್ ಅಥವಾ ಪಾಸ್‌ವರ್ಡ್ ತಪ್ಪಾಗಿದೆ." },
  "This account is currently unavailable.": { te: "ఈ ఖాతా ప్రస్తుతం అందుబాటులో లేదు.", kn: "ಈ ಖಾತೆ ಈಗ ಲಭ್ಯವಿಲ್ಲ." },
  "Too many verification attempts. Please wait before trying again.": {
    te: "చాలా సార్లు ప్రయత్నించారు. కొంతసేపు ఆగి మళ్లీ ప్రయత్నించండి.",
    kn: "ತುಂಬಾ ಸಲ ಪ್ರಯತ್ನಿಸಿದ್ದೀರಿ. ಸ್ವಲ್ಪ ಕಾದು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
  },
  "We could not reach the authentication service. Check your connection and try again.": {
    te: "సైన్ ఇన్ సేవను చేరుకోలేకపోయాం. ఇంటర్నెట్ చూసుకుని మళ్లీ ప్రయత్నించండి.",
    kn: "ಸೈನ್ ಇನ್ ಸೇವೆಯನ್ನು ತಲುಪಲು ಆಗಲಿಲ್ಲ. ಇಂಟರ್ನೆಟ್ ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
  },
  "Authentication could not be completed.": { te: "సైన్ ఇన్ పూర్తి కాలేదు.", kn: "ಸೈನ್ ಇನ್ ಪೂರ್ಣಗೊಳ್ಳಲಿಲ್ಲ." },
  "Too many password recovery requests. Please wait before trying again.": {
    te: "పాస్‌వర్డ్ రీసెట్ కోసం చాలా సార్లు అడిగారు. కొంతసేపు ఆగి మళ్లీ ప్రయత్నించండి.",
    kn: "ಪಾಸ್‌ವರ್ಡ್ ರೀಸೆಟ್‌ಗಾಗಿ ತುಂಬಾ ಸಲ ಕೇಳಿದ್ದೀರಿ. ಸ್ವಲ್ಪ ಕಾದು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
  },
  "We could not process password recovery right now. Please try again.": {
    te: "ఇప్పుడు పాస్‌వర్డ్ రీసెట్ చేయలేకపోయాం. మళ్లీ ప్రయత్నించండి.",
    kn: "ಈಗ ಪಾಸ್‌ವರ್ಡ್ ರೀಸೆಟ್ ಮಾಡಲು ಆಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
  },
  "We could not reach Craves. Check your connection and try again.": {
    te: "Craves ను చేరుకోలేకపోయాం. ఇంటర్నెట్ చూసుకుని మళ్లీ ప్రయత్నించండి.",
    kn: "Craves ಅನ್ನು ತಲುಪಲು ಆಗಲಿಲ್ಲ. ಇಂಟರ್ನೆಟ್ ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
  },
  "Your session could not be verified. Please sign in again.": {
    te: "మీ సైన్ ఇన్‌ను నిర్ధారించలేకపోయాం. మళ్లీ సైన్ ఇన్ చేయండి.",
    kn: "ನಿಮ್ಮ ಸೈನ್ ಇನ್ ಪರಿಶೀಲಿಸಲು ಆಗಲಿಲ್ಲ. ಮತ್ತೆ ಸೈನ್ ಇನ್ ಮಾಡಿ.",
  },
  "This action is not available for your account.": { te: "మీ ఖాతాకు ఇది అందుబాటులో లేదు.", kn: "ನಿಮ್ಮ ಖಾತೆಗೆ ಇದು ಲಭ್ಯವಿಲ್ಲ." },
  "Too many requests. Please wait a moment and try again.": {
    te: "చాలా సార్లు ప్రయత్నించారు. కొద్దిసేపు ఆగి మళ్లీ ప్రయత్నించండి.",
    kn: "ತುಂಬಾ ಸಲ ಪ್ರಯತ್ನಿಸಿದ್ದೀರಿ. ಸ್ವಲ್ಪ ಕಾದು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
  },
  "Craves is temporarily unavailable. Please try again.": {
    te: "Craves ప్రస్తుతం అందుబాటులో లేదు. మళ్లీ ప్రయత్నించండి.",
    kn: "Craves ಈಗ ಲಭ್ಯವಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
  },
  "We could not complete that request.": { te: "ఆ పని పూర్తి చేయలేకపోయాం.", kn: "ಆ ಕೆಲಸ ಮುಗಿಸಲು ಆಗಲಿಲ್ಲ." },
  // Thrown by the phone form when the session has no account.
  "Sign-in failed. Please try again.": { te: "సైన్ ఇన్ కాలేదు. మళ్లీ ప్రయత్నించండి.", kn: "ಸೈನ್ ಇನ್ ಆಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ." },
};

type View = "sign-in" | "forgot" | "sent";

const LABEL = "block text-left text-sm font-semibold text-[#1A1A1A]";
const INPUT = `mt-2 ${FIELD} aria-[invalid=true]:border-[#C4200F]`;
const FIELD_ERROR = "mt-2 text-left text-sm font-medium text-[#C4200F]";

/** The app's email screens: EmailSignIn, ForgotPassword and PasswordResetSent. There is no email sign-up. */
export function EmailSignInForm({
  chef,
  onSignedIn,
  onUsePhone,
}: {
  chef: boolean;
  /** Runs once the Craves session exists, exactly as after an OTP. */
  onSignedIn: (identity: CravesIdentity) => Promise<void>;
  /** Back to phone OTP, with an optional note to show there. */
  onUsePhone: (notice?: string) => void;
}) {
  const text = useText(TEXT);
  const { language } = useLanguage();
  const translate = (english: string) => (language === "en" ? english : (SENTENCES[english]?.[language] ?? english));
  const [view, setView] = useState<View>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [touched, setTouched] = useState({ email: false, password: false });
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);

  const errors = view === "sign-in" ? emailSignInErrors(email, password) : { email: emailError(email), password: undefined };
  const shownEmailError = touched.email ? errors.email : undefined;
  const shownPasswordError = touched.password ? errors.password : undefined;

  async function run(work: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (failure) {
      setOpening(false);
      if (failure instanceof PhoneVerificationRequiredError) onUsePhone(failure.message);
      else setError((failure as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function signIn(event: FormEvent) {
    event.preventDefault();
    setTouched({ email: true, password: true });
    if (errors.email || errors.password) {
      document.getElementById(errors.email ? "sign-in-email" : "sign-in-password")?.focus();
      return;
    }
    void run(async () => {
      const identity = await signInWithEmail(email, password);
      // "Opening…" holds while the next page loads, so the button never looks ready again.
      setOpening(true);
      await onSignedIn(identity);
    });
  }

  function requestReset(event: FormEvent) {
    event.preventDefault();
    setTouched((current) => ({ ...current, email: true }));
    if (errors.email) {
      document.getElementById("sign-in-email")?.focus();
      return;
    }
    void run(async () => {
      await sendPasswordReset(email);
      setView("sent");
    });
  }

  function show(next: View) {
    if (busy || opening) return;
    setError("");
    setView(next);
  }

  if (view === "sent")
    return (
      <section className={`${CARD} text-center`}>
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#F1F3F5]">
          <Check className="h-8 w-8 text-[#F62E18]" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">{text.sentTitle}</h1>
        <p id="reset-sent-message" role="status" className="mt-2 text-sm leading-6 text-[#6B6B6B]">{translate(PASSWORD_RECOVERY_NEUTRAL_MESSAGE)}</p>
        {/* Focus moves here from the button this view replaced, and reads the confirmation with it. */}
        <button type="button" className="craves-primary-action mt-7 w-full" autoFocus aria-describedby="reset-sent-message" onClick={() => show("sign-in")}>
          {text.backToLogin}
        </button>
      </section>
    );

  const signingIn = view === "sign-in";
  return (
    <section className={CARD}>
      <h1 className="text-3xl font-bold tracking-tight text-[#1A1A1A]">{signingIn ? text.welcomeBack : text.forgotTitle}</h1>
      <p className="mt-3 text-sm leading-6 text-[#6B6B6B]">{signingIn ? text.signInIntro : text.forgotIntro}</p>
      {/* A new key per view remounts the email field, so it takes focus again. */}
      <form key={view} className="mt-7 space-y-4" noValidate onSubmit={signingIn ? signIn : requestReset}>
        <div>
          <label htmlFor="sign-in-email" className={LABEL}>{text.email}</label>
          <input
            id="sign-in-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete={signingIn ? "username" : "email"}
            autoCapitalize="none"
            spellCheck={false}
            placeholder={text.emailPlaceholder}
            autoFocus
            className={INPUT}
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setError("");
            }}
            onBlur={() => setTouched((current) => ({ ...current, email: true }))}
            aria-invalid={shownEmailError ? true : undefined}
            aria-describedby={shownEmailError ? "sign-in-email-error" : undefined}
            // Read-only while checking, never disabled: the focused field keeps focus and the keypad stays up.
            readOnly={busy}
          />
          {shownEmailError ? <p id="sign-in-email-error" className={FIELD_ERROR}>{translate(shownEmailError)}</p> : null}
        </div>
        {signingIn ? (
          <div>
            <label htmlFor="sign-in-password" className={LABEL}>{text.password}</label>
            <div className="relative">
              <input
                id="sign-in-password"
                name="password"
                type={passwordVisible ? "text" : "password"}
                autoComplete="current-password"
                autoCapitalize="none"
                spellCheck={false}
                placeholder={text.passwordPlaceholder}
                className={`${INPUT} pr-14`}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError("");
                }}
                onBlur={() => setTouched((current) => ({ ...current, password: true }))}
                aria-invalid={shownPasswordError ? true : undefined}
                aria-describedby={shownPasswordError ? "sign-in-password-error" : undefined}
                readOnly={busy}
              />
              <button
                type="button"
                className="absolute bottom-0.5 right-1 flex h-11 w-11 items-center justify-center rounded-full !border-0 !bg-transparent !text-[#1A1A1A] !shadow-none"
                aria-label={passwordVisible ? text.hidePassword : text.showPassword}
                onClick={() => setPasswordVisible((visible) => !visible)}
                disabled={busy || opening}
              >
                {passwordVisible ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
              </button>
            </div>
            {shownPasswordError ? <p id="sign-in-password-error" className={FIELD_ERROR}>{translate(shownPasswordError)}</p> : null}
          </div>
        ) : null}
        {error ? <p role="alert" className="text-left text-sm font-medium text-[#C4200F]">{translate(error)}</p> : null}
        {signingIn ? (
          <div className="-my-1 flex justify-end">
            <button type="button" className={`${TEXT_BUTTON} -mr-3`} disabled={busy || opening} onClick={() => show("forgot")}>
              {text.forgot}
            </button>
          </div>
        ) : null}
        <button className="craves-primary-action w-full" aria-busy={busy} disabled={busy || opening}>
          {/* "Log in as Customer" is customer-only, so it stays English. */}
          {signingIn
            ? opening ? text.opening : busy ? text.loggingIn : chef ? text.chefLogIn : "Log in as Customer"
            : busy ? text.sending : text.sendReset}
        </button>
        <button
          type="button"
          className={SECONDARY_BUTTON}
          disabled={busy || opening}
          onClick={() => (signingIn ? onUsePhone() : show("sign-in"))}
        >
          {signingIn ? text.usePhone : text.backToLogin}
        </button>
      </form>
    </section>
  );
}
