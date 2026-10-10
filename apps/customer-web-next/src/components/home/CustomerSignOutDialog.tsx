import { Dialog, secondaryActionClass } from "@/components/ui/overlays/overlay";

interface CustomerSignOutDialogProps {
  open: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function CustomerSignOutDialog({
  open,
  busy,
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
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </>
      }
    />
  );
}

export default CustomerSignOutDialog;
