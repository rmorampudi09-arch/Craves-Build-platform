import { ArrowLeft, Lock } from "lucide-react";

/** Sticky "back + Payment title + secure checkout" header. */
export function CheckoutHeader({ onBack }: { onBack: () => void }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-cream/95 backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-border bg-white p-2 text-ink hover:border-primary"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="font-display text-lg font-bold text-ink">Payment</h1>
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Lock className="h-3 w-3" /> Secure checkout
          </p>
        </div>
      </div>
    </header>
  );
}

export default CheckoutHeader;
