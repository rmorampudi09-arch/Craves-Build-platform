import { deletionCopy } from "@/features/account-deletion/domain/deletion-copy";
import type { DeletionScope, DeletionSide, DeletionView } from "@/features/account-deletion/domain/deletion-types";

export function formatDeletionDate(iso: string, style: "short" | "long", timeZone?: string): string {
  const date = new Date(iso);
  // A bad date from the server must not crash the page; callers treat '' as no date.
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", ...(style === "long" ? { year: "numeric" } : {}), timeZone }).format(date);
}

export type EntryState =
  | { kind: "start" }
  | { kind: "inReview" | "scheduled" | "waiting" | "erasing" | "declined"; view: DeletionView };

export function entryStateFor(latest: DeletionView | null): EntryState {
  switch (latest?.status) {
    case "PENDING_REVIEW": return { kind: "inReview", view: latest };
    case "SCHEDULED": return { kind: "scheduled", view: latest };
    case "WAITING_ON_OPEN_ITEMS": return { kind: "waiting", view: latest };
    case "ERASING": return { kind: "erasing", view: latest };
    case "REJECTED": return { kind: "declined", view: latest };
    // none, CANCELLED and COMPLETED: nothing open, the person can start again
    default: return { kind: "start" };
  }
}

export type ScopeChoice = { scope: DeletionScope; title: string; subtitle: string };
export type ScopePlan = { kind: "direct"; scope: DeletionScope } | { kind: "choose"; options: ScopeChoice[]; riderNote: boolean };

/** What to ask the person: one side only when they are signed in on it; all three choices when the page cannot tell (the explainer's sign-in link). */
export function scopePlanFor(roles: readonly string[], side: DeletionSide): ScopePlan {
  const isChef = roles.includes("CHEF");
  const isRider = roles.includes("RIDER");
  if (side !== "chef" && !isChef) return { kind: "direct", scope: isRider ? "CUSTOMER" : "ALL" };
  const { chefSide, customerSide, whole } = deletionCopy.chooser;
  const sides: ScopeChoice[] = [
    ...(side !== "chef" ? [{ scope: "CUSTOMER" as const, ...customerSide }] : []),
    ...(side !== "customer" ? [{ scope: "CHEF" as const, ...chefSide }] : []),
  ];
  // A rider account is not deleted on the website, so the whole account is never offered.
  return { kind: "choose", options: isRider ? sides : [...sides, { scope: "ALL", ...whole }], riderNote: isRider };
}

export type SummaryKind = "customerAll" | "customerSide" | "chefSide" | "chefAll";

export function summaryKindFor(scope: DeletionScope, roles: readonly string[]): SummaryKind {
  if (scope === "CHEF") return "chefSide";
  if (scope === "CUSTOMER") return "customerSide";
  return roles.includes("CHEF") ? "chefAll" : "customerAll";
}

/** The code the server answers an order or meal plan with while a deletion request is open. */
export const isDeletionPaused = (code: string | null | undefined): boolean => code === "ACCOUNT_DELETION_PENDING";
