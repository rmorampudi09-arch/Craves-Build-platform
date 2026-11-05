"use client";

import { DeletionNote } from "@/features/account-deletion/components/deletion-page";
import { deletionCopy } from "@/features/account-deletion/domain/deletion-copy";
import type { SummaryKind } from "@/features/account-deletion/domain/deletion-model";
import { Dialog, secondaryActionClass } from "@/shared/ui/overlays/overlay";

const { confirm } = deletionCopy;

function contentFor(kind: SummaryKind, shortDate: string, chefSideStays: boolean) {
  switch (kind) {
    case "customerAll":
      return { title: confirm.customerAllTitle(shortDate), body: confirm.customerAllBody, info: confirm.customerInfo(shortDate), button: confirm.customerButton };
    case "customerSide":
      return { title: confirm.customerSideTitle(shortDate), body: chefSideStays ? confirm.customerSideBody : confirm.customerSideBodyNoChef, info: confirm.customerInfo(shortDate), button: confirm.customerButton };
    case "chefSide":
      return { title: confirm.chefTitle, body: confirm.chefSideBody, info: confirm.chefInfo, button: confirm.chefButton };
    case "chefAll":
      return { title: confirm.chefTitle, body: confirm.chefAllBody, info: confirm.chefInfo, button: confirm.chefButton };
  }
}

/** The last question before the request is sent. Cancel closes it; the red button sends. */
export function DeletionConfirmDialog({ open, kind, shortDate, chefSideStays, busy, error, onCancel, onConfirm }: {
  open: boolean;
  kind: SummaryKind;
  shortDate: string;
  /** Customer side only: the person also has a chef side, which stays. */
  chefSideStays: boolean;
  /** The request is on its way: the dialog stays open and both buttons wait. */
  busy: boolean;
  /** Why the last try did not go; sits above the buttons. */
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const content = contentFor(kind, shortDate, chefSideStays);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      busy={busy}
      title={content.title}
      description={content.body}
      footer={
        <>
          <button type="button" onClick={onCancel} disabled={busy} className={secondaryActionClass}>
            {confirm.cancel}
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} aria-busy={busy} className="craves-primary-action w-full sm:w-auto">
            {content.button}
          </button>
        </>
      }
    >
      <div className="mt-4 space-y-3">
        <DeletionNote tone="warning" text={content.info} />
        {error ? <p role="alert" className="rounded-xl bg-[#F1F3F5] p-3 text-sm font-medium text-[#C4200F]">{error}</p> : null}
      </div>
    </Dialog>
  );
}
