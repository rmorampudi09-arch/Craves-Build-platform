import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

/** ₹1,234.50 — amounts arrive as numbers or as decimal strings ("2384.76") from finance. */
export function formatInr(
  value: number | string | null | undefined,
  { currency = "INR", decimals = 2 }: { currency?: string; decimals?: number } = {},
): string {
  const amount = typeof value === "string" ? Number(value) : value;
  if (amount == null || !Number.isFinite(amount)) return "—";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(decimals)}`;
  }
}

/** "Just now", "12 min ago", "3 h ago", then a short date in India time. */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return "";
  const minutes = Math.round((now - at) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(at);
}

/** 1:31 pm in India time. */
export function clockTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(at).toLowerCase();
}

/** Sat, 10 Oct · 1:31 pm in India time. */
export function dateTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const day = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(at);
  return `${day} · ${clockTime(iso)}`;
}

/** APPLICANT_PHOTO -> "Applicant photo": backend codes read as plain words. */
export function sentenceCase(code: string | null | undefined): string {
  const words = (code ?? "").toLowerCase().split("_").filter(Boolean).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export type ChefTone = "attention" | "active" | "success" | "warning" | "muted" | "danger";

/** Order states in the words a chef uses, with the tone the order list shows. */
export function chefOrderStatus(status: string): { label: string; tone: ChefTone } {
  switch (status) {
    case "CHEF_ACCEPTANCE_PENDING":
      return { label: "New order", tone: "attention" };
    case "CHEF_ACCEPTED":
    case "PREPARING":
      return { label: "Cooking", tone: "active" };
    case "READY_FOR_PICKUP":
      return { label: "Ready for pickup", tone: "success" };
    case "OUT_FOR_DELIVERY":
      return { label: "On the way", tone: "active" };
    case "DELIVERED":
      return { label: "Delivered", tone: "muted" };
    case "CHEF_REJECTED":
      return { label: "Declined", tone: "danger" };
    case "CANCELLED":
      return { label: "Cancelled", tone: "danger" };
    default:
      return status.startsWith("REFUND")
        ? { label: "Refunded", tone: "muted" }
        : { label: "Waiting", tone: "muted" };
  }
}

export function ChefPill({
  tone = "muted",
  children,
  plain = false,
  icon: Icon,
}: {
  tone?: ChefTone;
  children: ReactNode;
  plain?: boolean;
  /** A picture in place of the dot, so the state reads without the words. */
  icon?: ComponentType<{ className?: string }>;
}) {
  return (
    <span className={`chef-pill is-${tone}${plain || Icon ? " is-plain" : ""}`}>
      {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

/** Page title block: no eyebrow, one h1, an optional single action. */
export function ChefPageHead({
  title,
  subtitle,
  action,
  back,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="chef-page-head">
      <div className="min-w-0">
        {back ? (
          <Link href={back.href} className="chef-back-link">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {back.label}
          </Link>
        ) : null}
        <h1 className="chef-page-title">{title}</h1>
        {subtitle ? <p className="chef-page-subtitle">{subtitle}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
    </header>
  );
}

export function ChefSection({
  title,
  note,
  action,
  children,
  flush = false,
  className = "",
  labelledBy,
}: {
  title?: ReactNode;
  note?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  /** Lists and stat grids run edge to edge; text content gets body padding. */
  flush?: boolean;
  className?: string;
  labelledBy?: string;
}) {
  return (
    <section className={`chef-section ${className}`} aria-labelledby={labelledBy}>
      {title || action ? (
        <div className="chef-section-head">
          <div className="min-w-0">
            {title ? <h2 id={labelledBy} className="chef-section-title">{title}</h2> : null}
            {note ? <p className="chef-section-note mt-0.5">{note}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {flush ? <div className={title || action ? "mt-3" : ""}>{children}</div> : <div className="chef-section-body">{children}</div>}
    </section>
  );
}

export function ChefEmpty({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: ComponentType<{ className?: string }>;
  title: ReactNode;
  text?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="chef-empty">
      <span className="chef-empty-icon">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <h2 className="chef-empty-title">{title}</h2>
      {text ? <p className="chef-empty-text">{text}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function ChefNotice({
  icon: Icon,
  tone = "info",
  children,
  role,
}: {
  icon: ComponentType<{ className?: string }>;
  tone?: "info" | "danger";
  children: ReactNode;
  role?: "status" | "alert";
}) {
  return (
    <div className={`chef-notice${tone === "danger" ? " is-danger" : ""}`} role={role}>
      <Icon aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * Pick one of a few choices, shown as chips. Real radio buttons underneath, so a screen
 * reader says "2 of 5" and arrow keys move between them; extra content (dates) goes below.
 */
export function ChefChoiceChips<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  disabled = false,
  children,
}: {
  legend: string;
  name: string;
  options: readonly { value: NoInfer<T>; label: string }[];
  value: T;
  onChange(value: NoInfer<T>): void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="chef-field-label">{legend}</legend>
      <div className="chef-chips is-wrap">
        {options.map((option) => (
          <label key={option.value} className="chef-chip is-choice">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              disabled={disabled}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
      {children}
    </fieldset>
  );
}

/** Shimmer blocks shaped like the content that is loading. */
export function ChefSkeleton({ className }: { className: string }) {
  return <div className={`chef-skeleton motion-reduce:animate-none ${className}`} aria-hidden="true" />;
}
