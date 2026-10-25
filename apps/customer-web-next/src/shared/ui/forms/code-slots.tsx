"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type InputHTMLAttributes } from "react";

export type CodeSlotsStatus = "idle" | "verifying" | "success" | "error";

export interface CodeSlotsProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "size" | "type"> {
  length?: number;
  /** Controlled value (digits only). Leave out to let the slots keep their own. */
  value?: string;
  onChange?: (value: string) => void;
  /** Called once each time the last slot is filled (typed, pasted or autofilled from the SMS). */
  onComplete?: (code: string) => void;
  status?: CodeSlotsStatus;
  accentColor?: string;
  inkColor?: string;
  slotColor?: string;
  digitColor?: string;
  dangerColor?: string;
  successColor?: string;
  slotSize?: number;
  gap?: number;
  radius?: number;
  /** Overshoot of a digit landing, as a share of `rise`. */
  bounce?: number;
  /** Seconds a digit takes to land. */
  settle?: number;
  /** Pixels a digit rises from. */
  rise?: number;
  /** Milliseconds between slots in the success and error waves. */
  cascade?: number;
  mask?: boolean;
  caret?: boolean;
  /** "accept": on success the slots fill in a wave. */
  outcome?: "accept" | "none";
}

/**
 * One-time-code slots. A single real input sits over the slots, so SMS autofill, paste,
 * Backspace and screen readers all work; the slots only draw what it holds.
 * Craves defaults: ink digits on neutral slots, Flame Red for the slot being typed,
 * green for accepted and deep red for a wrong code (borders only, never a red tint).
 */
export const CodeSlots = forwardRef<HTMLInputElement, CodeSlotsProps>(function CodeSlots(
  {
    length = 6,
    value,
    onChange,
    onComplete,
    status = "idle",
    accentColor = "#F62E18",
    inkColor = "#1A1A1A",
    slotColor = "#F1F3F5",
    digitColor = "#FFFFFF",
    dangerColor = "#C4200F",
    successColor = "#17803D",
    slotSize = 44,
    gap = 8,
    radius = 12,
    bounce = 0.2,
    settle = 0.3,
    rise = 8,
    cascade = 14,
    mask = false,
    caret = true,
    outcome = "accept",
    disabled,
    className = "",
    style,
    onFocus,
    onBlur,
    onSelect,
    ...input
  },
  ref,
) {
  const [own, setOwn] = useState("");
  const [focused, setFocused] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  // Set when a complete code made the field let go of focus (mouse or trackpad).
  const released = useRef(false);
  useImperativeHandle(ref, () => field.current as HTMLInputElement, []);
  const code = (value ?? own).replace(/\D/g, "").slice(0, length);

  // A wrong code clears the slots: take focus back so the code can be typed again straight away.
  useEffect(() => {
    if (!released.current || status !== "error" || code || disabled) return;
    released.current = false;
    field.current?.focus();
  }, [status, code, disabled]);

  // The caret always sits after the last digit: typing appends, Backspace removes the last one.
  const pinCaret = (target: HTMLInputElement) => {
    const end = target.value.length;
    if (target.selectionStart !== end || target.selectionEnd !== end) target.setSelectionRange(end, end);
  };

  const vars = {
    "--cs-length": length,
    "--cs-size": `${slotSize}px`,
    "--cs-gap": `${gap}px`,
    "--cs-radius": `${radius}px`,
    "--cs-bounce": bounce,
    "--cs-settle": `${settle}s`,
    "--cs-rise": `${rise}px`,
    "--cs-cascade": `${cascade}ms`,
    "--cs-accent": accentColor,
    "--cs-ink": inkColor,
    "--cs-slot": slotColor,
    "--cs-digit": digitColor,
    "--cs-danger": dangerColor,
    "--cs-success": successColor,
    ...style,
  } as CSSProperties;

  return (
    <div
      className={`code-slots is-${status}${outcome === "accept" ? " is-accepting" : ""}${disabled ? " is-disabled" : ""} ${className}`}
      style={vars}
    >
      <input
        {...input}
        ref={field}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        // No maxLength: the browser would cut a pasted "123 456" or "Your OTP is 123456" before the
        // digits are picked out below.
        spellCheck={false}
        // Password managers draw their own white menus over one-time-code fields; these opt out.
        data-lpignore="true"
        data-1p-ignore="true"
        data-bwignore="true"
        data-form-type="other"
        disabled={disabled}
        value={code}
        aria-invalid={status === "error" || undefined}
        className="code-slots-input"
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, "");
          // The caret is pinned to the end, so a full code pasted after some typed digits arrives
          // appended to them: the pasted code replaces them instead of being cut to "123654".
          const added = digits.startsWith(code) ? digits.slice(code.length) : "";
          const next = (added.length >= length ? added : digits).slice(0, length);
          if (value === undefined) setOwn(next);
          onChange?.(next);
          if (next.length !== length || next === code) return;
          // With a mouse or trackpad nothing needs the field once the code is checked by itself, and
          // letting go closes any autofill list, paste bubble or clipboard panel over the slots.
          // Touch keeps focus, so the keypad is still up for a retry.
          if (onComplete && window.matchMedia?.("(pointer: fine)")?.matches) {
            released.current = true;
            event.target.blur();
          }
          onComplete?.(next);
        }}
        onFocus={(event) => {
          setFocused(true);
          pinCaret(event.currentTarget);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        onSelect={(event) => {
          pinCaret(event.currentTarget);
          onSelect?.(event);
        }}
      />
      <div className="code-slots-row" aria-hidden="true">
        {Array.from({ length }, (_, index) => {
          const digit = code[index];
          const active = focused && !disabled && (index === code.length || (code.length === length && index === length - 1));
          return (
            <div
              key={index}
              className="code-slot"
              data-filled={digit ? "" : undefined}
              data-active={active ? "" : undefined}
              style={{ "--cs-i": index } as CSSProperties}
            >
              {/* Keyed by the digit, so each new one lands with its own rise. */}
              {digit ? (
                <span key={`${index}-${digit}`} className="code-slot-digit">
                  {mask ? "•" : digit}
                </span>
              ) : caret && active ? (
                <span className="code-slot-caret" />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
});
