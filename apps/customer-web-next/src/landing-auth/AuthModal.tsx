import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FormEvent, PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import './AuthModal.css';

export type AuthRole = 'customer' | 'chef';
export type AuthMode = 'sign-in' | 'sign-up';

export type VerificationRequest = {
  mode: AuthMode;
  role: AuthRole;
  phone: string;
  firstName?: string;
  lastName?: string;
  /** Retained for type compatibility; this form does not collect or send email. */
  email?: string;
};

export type VerifyCodeRequest = VerificationRequest & { code: string };

type AuthModalProps = {
  onClose: () => void;
  /** Used for both initial sends and resends; the server enforces its rate limits. */
  onRequestCode: (request: VerificationRequest, signal: AbortSignal) => Promise<void>;
  /** Resolve only after server verification. The host owns authenticated routing. */
  onVerifyCode: (request: VerifyCodeRequest, signal: AbortSignal) => Promise<void>;
};

type Fields = { firstName: string; lastName: string; mobile: string };
type FieldErrors = Partial<Record<keyof Fields, string>>;
const EMPTY_FIELDS: Fields = { firstName: '', lastName: '', mobile: '' };
const CLOSE_DURATION = 200;
const RESEND_DELAY_SECONDS = 30;

const CustomerIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="7.5" r="4" />
    <path d="M4.5 21v-1.5a7.5 7.5 0 0 1 15 0V21" />
  </svg>
);

const ChefIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 16v-3c-2.5-.2-4-1.9-4-4a4.2 4.2 0 0 1 4.5-4.2 5 5 0 0 1 9 0A4.2 4.2 0 0 1 21 9c0 2.1-1.5 3.8-4 4v3M7 16h10v4H7z" />
  </svg>
);

function normaliseMobile(value: string) {
  let digits = value.replace(/\D/g, '');
  // Accept a pasted Indian number with its country code or trunk prefix.
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(0, 10);
}

function validate(fields: Fields, mode: AuthMode, role: AuthRole): FieldErrors {
  const errors: FieldErrors = {};
  if (mode === 'sign-up' && role === 'customer') {
    if (!fields.firstName.trim()) errors.firstName = 'Enter your first name.';
    if (!fields.lastName.trim()) errors.lastName = 'Enter your last name.';
  }
  if (!/^[6-9]\d{9}$/.test(fields.mobile)) {
    errors.mobile = 'Enter a valid 10-digit mobile number.';
  }
  return errors;
}

/** In-page authentication UI. Form values live in memory only, never storage. */
const AuthModal = ({ onClose, onRequestCode, onVerifyCode }: AuthModalProps) => {
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [role, setRole] = useState<AuthRole>('customer');
  const [fields, setFields] = useState<Fields>({ ...EMPTY_FIELDS });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState('');
  const [otpVisible, setOtpVisible] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const [requestKind, setRequestKind] = useState<'send' | 'resend' | 'verify' | null>(null);
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null);
  const [resendSeconds, setResendSeconds] = useState(0);
  const submitting = requestKind !== null;
  const [closing, setClosing] = useState(false);
  const [contentHeight, setContentHeight] = useState<number>();
  const panelRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const otpRef = useRef<HTMLInputElement>(null);
  const mobileRef = useRef<HTMLInputElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isClosing = useRef(false);
  const beganOnBackdrop = useRef(false);
  const pendingRequest = useRef<AbortController | null>(null);
  const isSignUp = mode === 'sign-up';
  const roleName = role === 'customer' ? 'Customer' : 'Home Chef';
  const accountName = role === 'customer' ? 'customer' : 'chef';

  const requestClose = useCallback(() => {
    if (isClosing.current) return;
    isClosing.current = true;
    pendingRequest.current?.abort();
    setClosing(true);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    closeTimer.current = setTimeout(onClose, reducedMotion ? 0 : CLOSE_DURATION);
  }, [onClose]);

  useLayoutEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const appRoot = document.getElementById('root');
    const previousInert = appRoot?.inert ?? false;
    const previousAriaHidden = appRoot?.getAttribute('aria-hidden') ?? null;
    const previousStyles = [document.documentElement, document.body].map((element) => ({
      element,
      overflow: element.style.getPropertyValue('overflow'),
      priority: element.style.getPropertyPriority('overflow'),
    }));

    // Move focus before hiding the underlying app from assistive technology.
    titleRef.current?.focus({ preventScroll: true });
    if (appRoot) {
      appRoot.inert = true;
      appRoot.setAttribute('aria-hidden', 'true');
    }
    previousStyles.forEach(({ element }) => element.style.setProperty('overflow', 'hidden'));

    const focusableElements = () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled):not([tabindex="-1"]), a[href], select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
    ) ?? []).filter((element) => element.getClientRects().length > 0);

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        requestClose();
      } else if (event.key === 'Tab') {
        const elements = focusableElements();
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (!first) {
          event.preventDefault();
          titleRef.current?.focus({ preventScroll: true });
        } else if (event.shiftKey && (document.activeElement === first || !elements.includes(document.activeElement as HTMLElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !panelRef.current?.contains(document.activeElement))) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    const keepFocusInside = (event: FocusEvent) => {
      if (event.target instanceof Node && !panelRef.current?.contains(event.target)) {
        titleRef.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('keydown', handleKey, true);
    document.addEventListener('focusin', keepFocusInside);

    return () => {
      clearTimeout(closeTimer.current);
      pendingRequest.current?.abort();
      document.removeEventListener('keydown', handleKey, true);
      document.removeEventListener('focusin', keepFocusInside);
      if (appRoot) {
        appRoot.inert = previousInert;
        if (previousAriaHidden === null) appRoot.removeAttribute('aria-hidden');
        else appRoot.setAttribute('aria-hidden', previousAriaHidden);
      }
      previousStyles.forEach(({ element, overflow, priority }) => {
        if (overflow) element.style.setProperty('overflow', overflow, priority);
        else element.style.removeProperty('overflow');
      });
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [requestClose]);

  // Animate the panel's real content height when switching forms or showing
  // validation, while keeping long forms scrollable on small/zoomed screens.
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver !== 'function') return;
    const measure = () => setContentHeight(Math.ceil(content.getBoundingClientRect().height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    titleRef.current?.focus({ preventScroll: true });
  }, [mode]);

  // Focus the code again after a successful resend, without replaying the popup.
  useLayoutEffect(() => {
    if (!otpVisible) return;
    otpRef.current?.focus({ preventScroll: true });
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => {
      otpRef.current?.scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
    }, reducedMotion ? 0 : 360);
    return () => window.clearTimeout(timer);
  }, [otpVisible, resendAvailableAt]);

  // Use a deadline rather than decrementing state: background tabs catch up
  // immediately. No extra dependency or artificial network delay is needed.
  useEffect(() => {
    if (!otpVisible || resendAvailableAt === null || closing) return;
    const updateCountdown = () => {
      const seconds = Math.max(0, Math.ceil((resendAvailableAt - Date.now()) / 1000));
      setResendSeconds(seconds);
      if (seconds === 0) window.clearInterval(timer);
    };
    const timer = window.setInterval(updateCountdown, 1000);
    updateCountdown();
    document.addEventListener('visibilitychange', updateCountdown);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', updateCountdown);
    };
  }, [otpVisible, resendAvailableAt, closing]);

  const startResendCountdown = () => {
    setResendAvailableAt(Date.now() + RESEND_DELAY_SECONDS * 1000);
    setResendSeconds(RESEND_DELAY_SECONDS);
  };

  const resetOtp = () => {
    setOtpVisible(false);
    setOtp('');
    setOtpError('');
    setResendAvailableAt(null);
    setResendSeconds(0);
  };

  const updateField = (field: keyof Fields, value: string) => {
    const nextValue = field === 'mobile' ? normaliseMobile(value) : value;
    if (field === 'mobile' && nextValue !== fields.mobile) resetOtp();
    setFields((current) => ({ ...current, [field]: nextValue }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setNotice('');
  };

  const changeMode = () => {
    if (submitting || isClosing.current) return;
    setMode(isSignUp ? 'sign-in' : 'sign-up');
    resetOtp();
    setErrors({});
    setNotice('');
  };

  const changeRole = (nextRole: AuthRole) => {
    if (submitting || isClosing.current || nextRole === role) return;
    resetOtp();
    setRole(nextRole);
    setErrors({});
    setNotice('');
  };

  const buildRequest = (): VerificationRequest => ({
    mode,
    role,
    phone: `+91${fields.mobile}`,
    ...(isSignUp && role === 'customer' ? {
      firstName: fields.firstName.trim(),
      lastName: fields.lastName.trim(),
    } : {}),
  });

  const validateFields = () => {
    const nextErrors = validate(fields, mode, role);
    setErrors(nextErrors);
    const firstError = Object.keys(nextErrors)[0] as keyof Fields | undefined;
    if (firstError) {
      panelRef.current?.querySelector<HTMLInputElement>(`#craves-auth-${firstError}`)?.focus();
      return false;
    }
    return true;
  };

  const requestVerificationCode = async (kind: 'send' | 'resend') => {
    if (pendingRequest.current || isClosing.current) return;
    setNotice('');
    setOtpError('');

    const controller = new AbortController();
    pendingRequest.current = controller;
    setRequestKind(kind);
    try {
      await onRequestCode(buildRequest(), controller.signal);
      if (!controller.signal.aborted && !isClosing.current) {
        setOtp('');
        setOtpVisible(true);
        startResendCountdown();
      }
    } catch (error) {
      if (!controller.signal.aborted && !isClosing.current) {
        // Keep the previous code and allow retry if a resend fails.
        setNotice(error instanceof Error ? error.message : kind === 'resend'
          ? 'We could not resend the code. Please try again shortly.'
          : 'We could not request a verification code. Please try again.');
      }
    } finally {
      if (!controller.signal.aborted && !isClosing.current) setRequestKind(null);
      if (pendingRequest.current === controller) pendingRequest.current = null;
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pendingRequest.current || isClosing.current) return;
    setNotice('');
    setOtpError('');
    if (!validateFields()) return;

    if (!otpVisible) {
      await requestVerificationCode('send');
      return;
    }
    if (!/^\d{6}$/.test(otp)) {
      setOtpError('Enter the 6-digit verification code.');
      otpRef.current?.focus();
      return;
    }
    const controller = new AbortController();
    pendingRequest.current = controller;
    setRequestKind('verify');
    try {
      // Submit verifies the entered code; it never requests another SMS.
      await onVerifyCode({ ...buildRequest(), code: otp }, controller.signal);
      if (!controller.signal.aborted && !isClosing.current) {
        setNotice('Mobile number verified successfully.');
      }
    } catch (error) {
      if (!controller.signal.aborted && !isClosing.current) {
        setOtpError(error instanceof Error ? error.message : 'We could not verify this code. Please check the code and try again.');
      }
    } finally {
      if (!controller.signal.aborted && !isClosing.current) setRequestKind(null);
      if (pendingRequest.current === controller) pendingRequest.current = null;
    }
  };

  const handleResend = async () => {
    if (!otpVisible || pendingRequest.current || isClosing.current) return;
    // Check the real deadline too, not just the button's disabled state.
    if (resendAvailableAt !== null && Date.now() < resendAvailableAt) return;
    if (!validateFields()) return;
    await requestVerificationCode('resend');
  };

  const handleUseAnotherNumber = () => {
    if (pendingRequest.current || isClosing.current) return;
    resetOtp();
    setFields((current) => ({ ...current, mobile: '' }));
    setErrors({});
    setNotice('');
    // Keep the chosen role and names; return straight to the phone field.
    mobileRef.current?.focus();
  };

  const handleBackdropStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    beganOnBackdrop.current = event.target === event.currentTarget;
  };

  const fieldError = (field: keyof Fields) => errors[field] ? (
    <span className="auth-modal__field-error" id={`craves-auth-${field}-error`} role="alert">{errors[field]}</span>
  ) : null;

  return createPortal(
    <div
      className={`auth-modal ${closing ? 'auth-modal--closing' : ''}`}
      onPointerDown={handleBackdropStart}
      onClick={(event) => {
        if (event.target === event.currentTarget && beganOnBackdrop.current) requestClose();
        beganOnBackdrop.current = false;
      }}
    >
      <div className="auth-modal__backdrop" aria-hidden="true" />
      <section
        ref={panelRef}
        id="craves-auth-dialog"
        className="auth-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="craves-auth-title"
        data-native-scroll
      >
        <header className="auth-modal__header">
          <img className="auth-modal__logo" src="/landing-v20/images/craves-navbar-logo.png" alt="Craves" width="46" height="46" />
          <h2 ref={titleRef} id="craves-auth-title" className="auth-modal__title" tabIndex={-1}>
            {isSignUp ? 'Create your account' : `${roleName} sign in`}
          </h2>
          <button type="button" className="auth-modal__close" onClick={requestClose} aria-label="Close sign in and sign up">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div ref={scrollRef} className="auth-modal__scroll" data-native-scroll style={contentHeight ? { height: contentHeight } : undefined}>
          <div ref={contentRef} className="auth-modal__content">
            <div key={mode} className="auth-modal__view">
              <form onSubmit={handleSubmit} noValidate aria-busy={submitting}>
                <fieldset className="auth-modal__roles" disabled={submitting}>
                  <legend>Choose your role</legend>
                  <div className="auth-modal__role-grid">
                    {(['customer', 'chef'] as const).map((choice) => (
                      <label key={choice} className={`auth-modal__role ${role === choice ? 'auth-modal__role--selected' : ''}`}>
                        <input
                          className="auth-modal__radio"
                          type="radio"
                          name="craves-auth-role"
                          value={choice}
                          checked={role === choice}
                          tabIndex={role === choice ? 0 : -1}
                          onChange={() => changeRole(choice)}
                        />
                        <span className="auth-modal__role-content">
                          <span className="auth-modal__role-title">
                            {choice === 'customer' ? <CustomerIcon /> : <ChefIcon />}
                            <span>{choice === 'customer' ? 'Customer' : 'Home Chef'}</span>
                          </span>
                          {isSignUp && <span className="auth-modal__role-caption">
                            {choice === 'customer' ? 'Order homemade food' : 'Cook and grow with Craves'}
                          </span>}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="auth-modal__fields">
                  {isSignUp && role === 'customer' && <>
                    <div className="auth-modal__name-grid">
                      <div className="auth-modal__field">
                        <label htmlFor="craves-auth-firstName">First name <span className="auth-modal__required" aria-hidden="true">*</span></label>
                        <input
                          id="craves-auth-firstName" name="given-name" type="text" autoComplete="given-name"
                          placeholder="First name" maxLength={60} required disabled={submitting}
                          value={fields.firstName} onChange={(event) => updateField('firstName', event.target.value)}
                          aria-invalid={!!errors.firstName} aria-describedby={errors.firstName ? 'craves-auth-firstName-error' : undefined}
                        />
                        {fieldError('firstName')}
                      </div>
                      <div className="auth-modal__field">
                        <label htmlFor="craves-auth-lastName">Last name <span className="auth-modal__required" aria-hidden="true">*</span></label>
                        <input
                          id="craves-auth-lastName" name="family-name" type="text" autoComplete="family-name"
                          placeholder="Last name" maxLength={60} required disabled={submitting}
                          value={fields.lastName} onChange={(event) => updateField('lastName', event.target.value)}
                          aria-invalid={!!errors.lastName} aria-describedby={errors.lastName ? 'craves-auth-lastName-error' : undefined}
                        />
                        {fieldError('lastName')}
                      </div>
                    </div>
                  </>}
                  <div className="auth-modal__field">
                    <label htmlFor="craves-auth-mobile">Mobile number {isSignUp && <span className="auth-modal__required" aria-hidden="true">*</span>}</label>
                    <div className={`auth-modal__phone ${errors.mobile ? 'auth-modal__phone--invalid' : ''}`}>
                      <span className="auth-modal__country" aria-label="Country code +91">+91</span>
                      <input
                        ref={mobileRef}
                        id="craves-auth-mobile" name="tel-national" type="tel" autoComplete="tel-national" inputMode="numeric"
                        placeholder="10-digit mobile number" maxLength={18} required disabled={submitting}
                        aria-label="Mobile number, India country code +91"
                        value={fields.mobile} onChange={(event) => updateField('mobile', event.target.value)}
                        aria-invalid={!!errors.mobile} aria-describedby={errors.mobile ? 'craves-auth-mobile-error' : undefined}
                      />
                    </div>
                    {fieldError('mobile')}
                  </div>
                  {otpVisible && (
                    <div className="auth-modal__field auth-modal__otp">
                      <label htmlFor="craves-auth-otp">Verification code</label>
                      <input
                        ref={otpRef}
                        id="craves-auth-otp" name="one-time-code" type="text"
                        autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}"
                        placeholder="Enter 6-digit OTP" maxLength={6} required disabled={submitting}
                        autoCapitalize="none" spellCheck={false}
                        value={otp}
                        aria-invalid={!!otpError}
                        aria-describedby={otpError ? 'craves-auth-otp-error' : undefined}
                        onChange={(event) => {
                          setOtp(event.target.value.replace(/\D/g, '').slice(0, 6));
                          setOtpError('');
                          setNotice('');
                        }}
                      />
                      {otpError && (
                        <span className="auth-modal__field-error" id="craves-auth-otp-error" role="alert">
                          {otpError}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <button type="submit" className="auth-modal__submit" disabled={submitting || closing}>
                  {(requestKind === 'send' || requestKind === 'verify') && (
                    <span className="auth-modal__spinner" aria-hidden="true" />
                  )}
                  {requestKind === 'send' ? 'Sending verification code…'
                    : requestKind === 'verify' ? 'Submitting…'
                    : otpVisible ? 'Submit' : 'Send verification code'}
                </button>
                {otpVisible && (
                  <div className="auth-modal__otp-actions" role="group" aria-label="Verification code options">
                    <button
                      type="button"
                      className="auth-modal__otp-action auth-modal__resend"
                      onClick={handleResend}
                      disabled={resendSeconds > 0 || submitting || closing}
                    >
                      {requestKind === 'resend' && (
                        <span className="auth-modal__spinner" aria-hidden="true" />
                      )}
                      {requestKind === 'resend' ? 'Resending…'
                        : resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : 'Resend OTP'}
                    </button>
                    <button
                      type="button"
                      className="auth-modal__otp-action"
                      onClick={handleUseAnotherNumber}
                      disabled={submitting || closing}
                    >
                      Use another number
                    </button>
                  </div>
                )}
                {notice && <p className="auth-modal__notice" role="status" aria-live="polite">{notice}</p>}
              </form>

              <div className="auth-modal__footer">
                <p>
                  {isSignUp ? `Already have a ${accountName} account?` : 'New to Craves?'}{' '}
                  <button type="button" className="auth-modal__switch" onClick={changeMode} disabled={submitting}>
                    {isSignUp ? 'Sign in' : `Create a ${accountName} account`}
                  </button>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
};

export default AuthModal;
