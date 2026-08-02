interface CartCheckoutBarProps {
  total: number;
  onContinue: () => void;
}

/** Sticky bottom bar showing the grand total and a "Continue →" button. */
export function CartCheckoutBar({ total, onContinue }: CartCheckoutBarProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-cream/95 backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total</p>
          <p className="font-display text-2xl font-bold text-ink">₹{total}</p>
        </div>
        <button
          type="button"
          onClick={onContinue}
          className="btn-primary ml-auto px-6 py-3 text-base"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

export default CartCheckoutBar;
