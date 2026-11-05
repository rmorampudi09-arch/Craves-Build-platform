"use client";

import { useRef, useState, type ReactNode } from "react";
import { callAccountDeletion } from "@/features/account-deletion/api/account-deletion-api";
import { DeletionConfirmDialog } from "@/features/account-deletion/components/deletion-confirm-dialog";
import { DeletionPage } from "@/features/account-deletion/components/deletion-page";
import { DeletionSummary } from "@/features/account-deletion/components/deletion-summary";
import { ScopeChooser } from "@/features/account-deletion/components/scope-chooser";
import { deletionCopy } from "@/features/account-deletion/domain/deletion-copy";
import { formatDeletionDate, scopePlanFor, summaryKindFor, type SummaryKind } from "@/features/account-deletion/domain/deletion-model";
import type { DeletionScope, DeletionSide, DeletionView } from "@/features/account-deletion/domain/deletion-types";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const { chooser, customerSummary, chefSummary, sendErrors } = deletionCopy;

function sendErrorText(code: string | null): string {
  if (code === "ACCOUNT_DELETION_NOT_ENABLED") return sendErrors.notEnabled;
  return code === "ACCOUNT_DELETION_SCOPE_NOT_ALLOWED" ? sendErrors.scopeNotAllowed : sendErrors.failed;
}

function summaryTitle(kind: SummaryKind): string {
  if (kind === "chefSide") return chefSummary.titleSide;
  return kind === "chefAll" ? chefSummary.titleAll : customerSummary.title;
}

/** Nothing open: pick a side (when there is a choice), read what goes and what stays, confirm, send. */
export function DeletionStart({ side, roles, notice, onSent, onLookAgain, onSignOut }: {
  side: DeletionSide;
  roles: readonly string[];
  /** What Keep my account last said. */
  notice: ReactNode;
  /** The request went through; the page renews the sign-in and shows this answer. */
  onSent: (view: DeletionView | null) => Promise<void>;
  /** Asks the server what it holds now. */
  onLookAgain: () => Promise<void>;
  onSignOut: () => void;
}) {
  const plan = scopePlanFor(roles, side);
  const [picked, setPicked] = useState<DeletionScope | null>(null);
  const [chosen, setChosen] = useState<DeletionScope | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A ref: two clicks before React re-renders the button both still see sending === false.
  const inFlight = useRef(false);
  // Customer scopes are deleted 30 days from today, worked out in the browser like the app does.
  const [dueAt] = useState(() => new Date(Date.now() + THIRTY_DAYS_MS).toISOString());

  async function send(scope: DeletionScope) {
    if (inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    setError(null);
    try {
      const answer = await callAccountDeletion("POST", scope);
      if (answer.ok) {
        await onSent(answer.view);
      } else if (answer.code === "ACCOUNT_DELETION_ALREADY_REQUESTED" || answer.code === "INVALID_DELETION_RESPONSE") {
        // A request is open, or the server may have taken this one: never say "not sent", show what it holds.
        setConfirming(false);
        await onLookAgain();
      } else {
        setError(sendErrorText(answer.code));
      }
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  // The person's pick wins over a plan recomputed from roles that may have changed since.
  const scope = chosen ?? (plan.kind === "direct" ? plan.scope : null);
  if (scope === null) {
    return plan.kind === "choose" ? (
      <DeletionPage side={side} title={chooser.title} onSignOut={onSignOut}>
        {notice}
        <ScopeChooser options={plan.options} riderNote={plan.riderNote} value={picked} onChange={setPicked} />
        <button type="button" disabled={picked === null} onClick={() => setChosen(picked)} className="craves-primary-action w-full">
          {chooser.continue}
        </button>
      </DeletionPage>
    ) : null;
  }

  const kind = summaryKindFor(scope, roles);
  const hasChef = roles.includes("CHEF");
  const shortDate = formatDeletionDate(dueAt, "short");
  return (
    <DeletionPage side={side} title={summaryTitle(kind)} onSignOut={onSignOut}>
      {notice}
      <DeletionSummary
        kind={kind}
        shortDate={shortDate}
        longDate={formatDeletionDate(dueAt, "long")}
        chefSideStays={hasChef}
        customerSideStays={roles.includes("CUSTOMER")}
      />
      <button
        type="button"
        onClick={() => {
          setError(null);
          setConfirming(true);
        }}
        className="craves-primary-action w-full"
      >
        {kind === "customerAll" || kind === "customerSide" ? customerSummary.button : chefSummary.button}
      </button>
      <DeletionConfirmDialog
        open={confirming}
        kind={kind}
        shortDate={shortDate}
        chefSideStays={hasChef}
        busy={sending}
        error={error}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void send(scope)}
      />
    </DeletionPage>
  );
}
