"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cardClass } from "@/features/account-deletion/components/deletion-page";
import { deletionCopy } from "@/features/account-deletion/domain/deletion-copy";
import { formatDeletionDate, type EntryState } from "@/features/account-deletion/domain/deletion-model";
import type { DeletionScope } from "@/features/account-deletion/domain/deletion-types";
import { secondaryActionClass } from "@/shared/ui/overlays/overlay";

const { state: copy } = deletionCopy;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type OpenState = Exclude<EntryState, { kind: "start" }>;
type Step = { title: string; body: string; status: "done" | "current" | "todo" };
type Content = { tag?: string; title: string; body?: string; steps?: Step[]; reason?: string | null; lines?: readonly string[] };

/** A scope the page does not know reads as the whole account. */
function byScope<T>(map: Record<DeletionScope, T>, scope: DeletionScope): T {
  return map[scope] ?? map.ALL;
}

function formatted(iso: string | null, style: "short" | "long", shiftMs = 0): string {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(ms) ? "" : formatDeletionDate(new Date(ms + shiftMs).toISOString(), style);
}

function contentFor({ kind, view }: OpenState): Content {
  const { scope } = view;
  switch (kind) {
    case "inReview": {
      const last = byScope({ CHEF: copy.inReviewLastSide, CUSTOMER: copy.stepDeleted.CUSTOMER, ALL: copy.inReviewLastAll }, scope);
      return {
        tag: copy.inReviewTag,
        title: copy.inReviewTitle,
        body: copy.inReviewBody,
        steps: [...copy.inReviewSteps, last].map((title, index) => ({
          title,
          body: index === 0 ? formatted(view.requestedAt, "short") : (copy.inReviewStepBodies[index] ?? ""),
          status: index === 0 ? "done" : index === 1 ? "current" : "todo",
        })),
      };
    }
    case "scheduled": {
      const reminder = formatted(view.dueAt, "short", -WEEK_MS);
      return {
        tag: copy.scheduledTag,
        title: byScope(copy.scheduledTitle, scope)(formatted(view.dueAt, "long")),
        body: byScope(copy.scheduledBody, scope),
        steps: [
          { title: copy.stepAsked, body: formatted(view.requestedAt, "short"), status: "done" },
          { title: copy.stepReminder, body: reminder ? copy.stepReminderBody(reminder) : "", status: "current" },
          { title: byScope(copy.stepDeleted, scope), body: formatted(view.dueAt, "short"), status: "todo" },
        ],
      };
    }
    case "waiting":
      return { tag: copy.waitingTag, title: copy.waitingTitle, body: copy.waitingBody };
    case "erasing":
      return { title: byScope(copy.erasingTitle, scope), body: copy.erasingBody };
    case "declined":
      return { tag: copy.declinedTag, title: byScope(copy.declinedTitle, scope), reason: view.reviewNote, lines: copy.declinedLines };
  }
}

function StepRow({ step, index }: { step: Step; index: number }) {
  const marker = step.status === "done" ? "bg-[#0E7C3A] text-white" : step.status === "current" ? "bg-[#F62E18] text-white" : "bg-[#F1F3F5] text-[#6B6B6B]";
  return (
    <li className="flex items-start gap-3">
      <span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${marker}`}>
        {step.status === "done" ? <Check className="h-3.5 w-3.5" /> : index + 1}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-base font-semibold ${step.status === "todo" ? "text-[#6B6B6B]" : ""}`}>{step.title}</span>
        {step.body ? <span className="block text-sm leading-6 text-[#6B6B6B]">{step.body}</span> : null}
      </span>
    </li>
  );
}

/** Where a delete request stands: in review, scheduled, waiting, being deleted or declined. */
export function DeletionStateView({ state, roles, keeping, notice, onKeep, onAskAgain }: {
  state: OpenState;
  /** Decides whether Keep my account says the kitchen reopens. */
  roles: readonly string[];
  keeping: boolean;
  /** What Keep my account last said, above the buttons. */
  notice: ReactNode;
  onKeep: () => void;
  /** Declined only: the page shows the start flow. */
  onAskAgain: () => void;
}) {
  const { kind, view } = state;
  const content = contentFor(state);
  const keepsKitchen = view.scope === "CHEF" || (view.scope === "ALL" && roles.includes("CHEF"));
  const keepButton = (
    <button type="button" onClick={onKeep} disabled={keeping} aria-busy={keeping} className="craves-primary-action w-full">
      {deletionCopy.banner.keep}
    </button>
  );

  return (
    <>
      {content.tag ? (
        <span className={`self-start rounded-full px-3 py-1 text-xs font-bold uppercase ${kind === "declined" ? "bg-[#FDEAE8] text-[#C4200F]" : "bg-[#FFF6E5] text-[#7A4D0B]"}`}>
          {content.tag}
        </span>
      ) : null}
      <h2 className="text-xl font-bold leading-7">{content.title}</h2>
      {content.body ? <p className="text-base leading-6 text-[#6B6B6B]">{content.body}</p> : null}
      {content.steps ? (
        <ol className={cardClass + " !space-y-4"}>
          {content.steps.map((step, index) => <StepRow key={step.title} step={step} index={index} />)}
        </ol>
      ) : null}
      {content.reason ? (
        <section className="space-y-1 rounded-2xl bg-[#FDEAE8] p-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-[#C4200F]">{copy.reasonLabel}</h3>
          <p className="text-base font-semibold">{content.reason}</p>
        </section>
      ) : null}
      {content.lines?.map((line) => <p key={line} className="text-base leading-6 text-[#6B6B6B]">{line}</p>)}
      {notice}
      {kind === "inReview" ? (
        <div className="space-y-2">
          {keepButton}
          {keepsKitchen ? <p className="text-center text-sm text-[#6B6B6B]">{copy.keepNoteKitchen}</p> : null}
        </div>
      ) : kind === "scheduled" || kind === "waiting" ? (
        keepButton
      ) : kind === "declined" ? (
        <div className="flex flex-col gap-2">
          <button type="button" onClick={onAskAgain} className="craves-primary-action w-full">{copy.askAgain}</button>
          {/* Email, not /help: during the customer launch lock /help leads to the launching-soon note. */}
          <a href="mailto:support@craves.in" className={secondaryActionClass + " sm:w-full"}>{copy.contactSupport}</a>
        </div>
      ) : null}
    </>
  );
}
