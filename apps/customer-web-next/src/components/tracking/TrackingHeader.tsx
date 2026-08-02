import { ArrowLeft } from "lucide-react";

interface TrackingHeaderProps {
  orderId: string;
  onBack: () => void;
}

/** Sticky "back + Track Order title + short order id" header. */
export function TrackingHeader({ orderId, onBack }: TrackingHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-cream/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-border bg-white p-2 text-ink hover:border-primary"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="font-display text-lg font-bold text-ink">Track Order</h1>
          <p className="text-[11px] text-muted-foreground">#{orderId.slice(-6).toUpperCase()}</p>
        </div>
      </div>
    </header>
  );
}

export default TrackingHeader;
