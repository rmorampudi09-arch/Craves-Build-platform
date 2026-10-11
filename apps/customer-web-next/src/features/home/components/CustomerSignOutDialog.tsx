import { Dialog, secondaryActionClass } from "@/components/ui/overlays/overlay";

interface CustomerSignOutDialogProps {
  open: boolean;
  busy: boolean;
  /** Shown inside the dialog so the retry is right there. */
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function CustomerSignOutDialog({
  open,
  busy,
  error = "",
  onCancel,
  onConfirm,
}: CustomerSignOutDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      busy={busy}
      title="Sign out of Craves?"
      description="You'll need to sign in again to see your orders, saved addresses and cart."
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className={secondaryActionClass}
          >
            Stay signed in
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy}
            className="craves-primary-action w-full sm:w-auto"
          >
            {busy ? "Signing out…" : error ? "Try again" : "Sign out"}
          </button>
        </>
      }
    >
      {error ? (
        <p role="alert" className="mt-4 rounded-xl bg-[#F1F3F5] p-3 text-sm font-medium text-[#C4200F]">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}

export default CustomerSignOutDialog;
