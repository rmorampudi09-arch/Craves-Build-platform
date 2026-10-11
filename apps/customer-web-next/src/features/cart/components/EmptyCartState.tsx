import { ArrowRight, ShoppingBag } from "lucide-react";

export function EmptyCartState({ onBrowseMenu }: { onBrowseMenu: () => void }) {
  return (
    <div className="rounded-[8px] border border-dashed border-border bg-white p-8 text-center shadow-[var(--shadow-card)] md:p-12">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
        <ShoppingBag className="h-8 w-8" aria-hidden="true" />
      </span>
      <h1 className="mt-5 font-display text-2xl font-bold tracking-[-0.035em] text-ink">
        Your cart is empty
      </h1>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        See what home chefs near you are cooking today.
      </p>
      <button type="button" onClick={onBrowseMenu} className="craves-primary-action mt-6">
        Browse food <ArrowRight className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
}

export default EmptyCartState;
