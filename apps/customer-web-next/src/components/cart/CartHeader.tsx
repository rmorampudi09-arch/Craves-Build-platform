import { Link } from "@tanstack/react-router";
import { FaArrowLeft } from "react-icons/fa6";
import { CravesLogo } from "@/components/brand/CravesLogo";
import { PersistentCustomerServiceNav } from "@/components/navigation/PersistentCustomerServiceNav";

export function CartHeader({ onBack }: { onBack: () => void }) {
  return (
    <header className="sticky top-0 z-30 border-b border-[#E5E7EB] bg-white/95 backdrop-blur-xl">
      <div className="mx-auto flex min-h-[84px] max-w-4xl items-center gap-3 px-4 py-3 md:px-6">
        <button
          type="button"
          onClick={onBack}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[#1A1A1A] transition-colors hover:bg-[#F1F3F5]"
          aria-label="Back to discovery"
        >
          <FaArrowLeft className="text-lg" aria-hidden="true" />
        </button>
        <Link
          to="/home"
          className="flex min-h-11 min-w-0 items-center gap-3 rounded-xl"
        >
          <CravesLogo size="sm" />
          <span className="min-w-0">
            <span className="block font-display text-lg font-bold tracking-[-0.03em] text-[#1A1A1A]">
              Your cart
            </span>
            <span className="block truncate text-xs text-[#6B6B6B]">
              Live items and backend totals
            </span>
          </span>
        </Link>
      </div>
      <div className="mx-auto max-w-4xl px-4 pb-3 md:px-6">
        <PersistentCustomerServiceNav />
      </div>
    </header>
  );
}

export default CartHeader;
