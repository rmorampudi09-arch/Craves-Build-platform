import { LogOut, X } from "lucide-react";
import { useEffect, useRef } from "react";

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
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onCancel, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 px-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="customer-signout-title"
      aria-describedby="customer-signout-description"
    >
      <div className="w-full max-w-md rounded-[1.75rem] border border-[#E5E7EB] bg-white p-6 shadow-[0_24px_70px_rgba(26,26,26,0.20)] md:p-7">
        <div className="flex items-start justify-between gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
            <LogOut className="h-5 w-5" aria-hidden="true" />
          </span>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="!flex !h-10 !w-10 !items-center !justify-center !rounded-full !bg-[#F1F3F5] !p-0 !text-[#1A1A1A] disabled:opacity-50"
            aria-label="Close sign out confirmation"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <h2 id="customer-signout-title" className="mt-5 font-display text-2xl font-black tracking-[-0.035em] text-[#1A1A1A]">
          Sign out of Craves?
        </h2>
        <p id="customer-signout-description" className="mt-2 text-sm leading-6 text-[#6B6B6B]">
          You will need to sign in again to view your saved addresses, cart and customer account.
        </p>

        <div className="mt-7 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="!min-h-11 !rounded-full !bg-[#F1F3F5] !px-5 !text-sm !font-black !text-[#1A1A1A] disabled:opacity-50"
          >
            Stay signed in
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="!min-h-11 !rounded-full !bg-[#F62E18] !px-5 !text-sm !font-black !text-white disabled:cursor-wait disabled:opacity-60"
          >
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CustomerSignOutDialog;
