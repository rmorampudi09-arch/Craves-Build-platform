import Image from "next/image";
import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, X } from "lucide-react";
import { formatRelativeTime } from "@/shared/lib/relative-time";
import { EmptyIllustration, type EmptyIllustrationName } from "@/shared/ui/feedback/EmptyIllustration";
import { messages, type Language } from "@/shared/i18n/language";
import { useText } from "@/shared/i18n/language-context";

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

/** The app's words, as on chef tickets and notifications: "Just now", "12 min ago", "3 hr ago", "Yesterday", "13 Oct". */
export function timeAgo(iso: string, now: number = Date.now(), language: Language = "en"): string {
  return formatRelativeTime(iso, new Date(now), language);
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

const ORDER_STATUS = messages({
  en: { new: "New order", cooking: "Cooking", ready: "Ready for pickup", onTheWay: "On the way", delivered: "Delivered", declined: "Declined", cancelled: "Cancelled", refunded: "Refunded", unpaid: "Not paid yet" },
  te: { new: "కొత్త ఆర్డర్", cooking: "వంట అవుతోంది", ready: "తీసుకెళ్లడానికి సిద్ధం", onTheWay: "దారిలో ఉంది", delivered: "డెలివరీ అయింది", declined: "తిరస్కరించారు", cancelled: "రద్దయింది", refunded: "డబ్బు తిరిగి ఇచ్చారు", unpaid: "ఇంకా చెల్లించలేదు" },
  kn: { new: "ಹೊಸ ಆರ್ಡರ್", cooking: "ಅಡುಗೆ ಆಗುತ್ತಿದೆ", ready: "ತೆಗೆದುಕೊಂಡು ಹೋಗಲು ಸಿದ್ಧ", onTheWay: "ದಾರಿಯಲ್ಲಿದೆ", delivered: "ಡೆಲಿವರಿ ಆಗಿದೆ", declined: "ತಿರಸ್ಕರಿಸಲಾಗಿದೆ", cancelled: "ರದ್ದಾಗಿದೆ", refunded: "ಹಣ ಹಿಂದಿರುಗಿಸಲಾಗಿದೆ", unpaid: "ಇನ್ನೂ ಪಾವತಿಸಿಲ್ಲ" },
});

/** The customer hasn't paid yet: nothing for the chef to cook, so chef lists leave these out. */
export function isUnpaidOrder(status: string): boolean {
  return status === "PAYMENT_PENDING" || status === "PAID" || status === "CREATED";
}

/** Answering, cooking or handing over: the only time a chef needs the customer's name, phone and address.
 * A cancelled order may never have been paid, so it keeps them private too. */
export function needsCustomerContact(status: string): boolean {
  return ["CHEF_ACCEPTANCE_PENDING", "CHEF_ACCEPTED", "PREPARING", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY"].includes(status);
}

/** Order states in the words a chef uses, with the tone the order list shows. */
export function chefOrderStatus(status: string, language: Language = "en"): { label: string; tone: ChefTone } {
  const words = ORDER_STATUS[language];
  switch (status) {
    case "CHEF_ACCEPTANCE_PENDING":
      return { label: words.new, tone: "attention" };
    case "CHEF_ACCEPTED":
    case "PREPARING":
      return { label: words.cooking, tone: "active" };
    case "READY_FOR_PICKUP":
      return { label: words.ready, tone: "success" };
    case "OUT_FOR_DELIVERY":
      return { label: words.onTheWay, tone: "active" };
    case "DELIVERED":
      return { label: words.delivered, tone: "muted" };
    case "CHEF_REJECTED":
      return { label: words.declined, tone: "danger" };
    case "CANCELLED":
      return { label: words.cancelled, tone: "danger" };
    default:
      // "Waiting" told the chef nothing: an order before payment is not theirs to cook yet.
      return status.startsWith("REFUND")
        ? { label: words.refunded, tone: "muted" }
        : { label: words.unpaid, tone: "muted" };
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
  image,
  illustration,
  title,
  text,
  action,
}: {
  icon?: ComponentType<{ className?: string }>;
  /** A drawing of the work this screen is about, shown in place of the icon. */
  image?: { src: string; alt: string; width: number; height: number };
  /** One of the app's empty-state drawings (app 1.35.0), so a chef sees the same picture in the app and here. */
  illustration?: EmptyIllustrationName;
  title: ReactNode;
  text?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="chef-empty">
      {illustration ? (
        <EmptyIllustration name={illustration} className="chef-empty-drawing" />
      ) : image ? (
        <Image src={image.src} alt={image.alt} width={image.width} height={image.height} sizes="20rem" className="chef-empty-image" />
      ) : Icon ? (
        <span className="chef-empty-icon">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>
      ) : null}
      <h2 className="chef-empty-title">{title}</h2>
      {text ? <p className="chef-empty-text">{text}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

const FLASH_TEXT = messages({
  en: { close: "Close message" },
  te: { close: "సందేశం మూసివేయండి" },
  kn: { close: "ಸಂದೇಶ ಮುಚ್ಚಿ" },
});

/**
 * The short message after an action, floating above the tab bar. Success leaves by itself after
 * 3.5 s and waits while it is pointed at or focused: CSS times it (.chef-flash), so it needs no
 * timer here. An error stays until it is closed or the next action clears it. Keep it rendered
 * with an empty message: its live region must exist before the words arrive.
 */
export function ChefFlash({
  message,
  tone = "success",
  onClose,
  announce = true,
  id,
}: {
  message: string;
  tone?: "success" | "danger";
  onClose(): void;
  /** False when the screen already reads the words out from its own live region. */
  announce?: boolean;
  /** For a screen that moves focus here after an action. */
  id?: string;
}) {
  const Icon = tone === "danger" ? AlertTriangle : CheckCircle2;
  const closeLabel = useText(FLASH_TEXT).close;
  return (
    <div id={id} className="chef-flash-region" role={announce && tone === "success" ? "status" : undefined}>
      {message ? (
        <div
          key={message}
          role={tone === "danger" ? "alert" : undefined}
          className={`chef-flash is-${tone}`}
          onAnimationEnd={(event) => {
            if (tone === "success" && event.target === event.currentTarget) onClose();
          }}
        >
          <Icon aria-hidden="true" />
          <p>{message}</p>
          <button type="button" className="chef-flash-close" aria-label={closeLabel} onClick={onClose}>
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      ) : null}
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
