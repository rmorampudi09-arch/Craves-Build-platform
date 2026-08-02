import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import cravesLogo from "@/assets/images/craves-logo.png";
import { assetUrl } from "@/lib/asset-url";

/** Sticky "back + logo + title" header on the cart page. */
export function CartHeader({ onBack }: { onBack: () => void }) {
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
        <Link to="/home" className="flex items-center gap-2">
          <img src={assetUrl(cravesLogo)} alt="Craves" width={32} height={32} className="h-8 w-8" />
          <span className="font-display text-lg font-bold text-primary">Your Cart</span>
        </Link>
      </div>
    </header>
  );
}

export default CartHeader;
