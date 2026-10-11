"use client";

import type { ReactNode } from "react";
import { AlertCircle, Check, CheckCircle2, Info, Lock } from "lucide-react";

/** Small presentational primitives shared by every Chef onboarding screen. */

export function Card({
  icon,
  title,
  subtitle,
  done,
  children,
  className = "",
  id,
  labelledBy,
}: {
  icon?: ReactNode;
  title?: string;
  subtitle?: string;
  done?: boolean;
  children?: ReactNode;
  className?: string;
  id?: string;
  labelledBy?: string;
}) {
  const headingId = labelledBy ?? (id && title ? `${id}-title` : undefined);
  return (
    <section
      id={id}
      tabIndex={id ? -1 : undefined}
      className={`cob-card ${className}`}
      aria-labelledby={title ? headingId : undefined}
    >
      {title ? (
        <div className={`cob-card-head ${children ? "" : "cob-card-head--flush"}`}>
          {icon ? <span className="cob-icon-well">{icon}</span> : null}
          <div className="cob-card-title">
            <h2 id={headingId}>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {done ? (
            <span className="cob-done-tick" role="img" aria-label="Complete">
              <Check size={15} strokeWidth={3} aria-hidden="true" />
            </span>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <span id={id} className="cob-error" role="alert">
      <AlertCircle size={15} aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}

export function FieldShell({
  id,
  label,
  optional,
  helper,
  error,
  children,
  after,
}: {
  id: string;
  label: string;
  optional?: boolean;
  helper?: ReactNode;
  error?: string | null;
  children: ReactNode;
  after?: ReactNode;
}) {
  return (
    <div className="cob-field">
      <label className="cob-label" htmlFor={id}>
        {label}
        {optional ? <span className="cob-optional"> (optional)</span> : null}
      </label>
      {children}
      {error ? (
        <FieldError id={`${id}-error`}>{error}</FieldError>
      ) : helper ? (
        <span id={`${id}-helper`} className="cob-helper">
          {helper}
        </span>
      ) : null}
      {after}
    </div>
  );
}

export function describedBy(id: string, error?: string | null, helper?: ReactNode) {
  return error ? `${id}-error` : helper ? `${id}-helper` : undefined;
}

export function VerifiedBadge({ label = "Verified" }: { label?: string }) {
  return (
    <span className="cob-verified">
      <CheckCircle2 size={15} aria-hidden="true" />
      {label}
    </span>
  );
}

export function LockedInput({
  id,
  label,
  value,
  helper,
  badge,
}: {
  id: string;
  label: string;
  value: string;
  helper?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <FieldShell id={id} label={label} helper={helper}>
      <div className="cob-control">
        <input
          id={id}
          className={`cob-input ${badge ? "cob-input--with-adornment" : "cob-input--with-trailing-icon"}`}
          value={value}
          readOnly
          aria-readonly="true"
          aria-describedby={helper ? `${id}-helper` : undefined}
        />
        {badge ? (
          <span className="cob-adornment">{badge}</span>
        ) : (
          <Lock size={18} className="cob-lock" aria-hidden="true" />
        )}
      </div>
    </FieldShell>
  );
}

export type ChipTone = "complete" | "progress" | "attention" | "idle" | "approved";
export function StatusChip({ tone, children }: { tone: ChipTone; children: ReactNode }) {
  return (
    <span className={`cob-chip cob-chip--${tone}`}>
      {tone === "complete" ? <Check size={13} strokeWidth={3} aria-hidden="true" /> : null}
      {tone === "attention" ? <AlertCircle size={13} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export function Note({
  tone = "tint",
  icon,
  children,
  role,
}: {
  tone?: "tint" | "neutral" | "error";
  icon?: ReactNode;
  children: ReactNode;
  role?: "status" | "alert";
}) {
  return (
    <div role={role} className={`cob-note ${tone === "tint" ? "" : `cob-note--${tone}`}`}>
      {icon ??
        (tone === "error" ? (
          <AlertCircle size={18} aria-hidden="true" />
        ) : (
          <Info size={18} aria-hidden="true" />
        ))}
      <div>{children}</div>
    </div>
  );
}

export function Spinner({ red = false }: { red?: boolean }) {
  return <span className={`cob-spinner ${red ? "cob-spinner--red" : ""}`} aria-hidden="true" />;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileKind(name: string, type?: string): string {
  const extension = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toUpperCase();
  if (extension) return extension === "JPEG" ? "JPG" : extension;
  if (type === "application/pdf") return "PDF";
  return type?.split("/")[1]?.toUpperCase() ?? "FILE";
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateOfBirth(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!)).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatFssai(value: string): string {
  return /^\d{14}$/.test(value)
    ? value.replace(/^(\d{4})(\d{4})(\d{4})(\d{2})$/, "$1 $2 $3 $4")
    : value;
}

export function formatPhone(value: string): string {
  const match = /^(?:\+?91)?(\d{5})(\d{5})$/.exec(value.replace(/\s/g, ""));
  return match ? `+91 ${match[1]} ${match[2]}` : value;
}
