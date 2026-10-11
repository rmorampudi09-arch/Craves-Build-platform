import { Link } from "@tanstack/react-router";
import { FaArrowLeft } from "react-icons/fa6";
import { CravesLogo } from "@/shared/components/brand/CravesLogo";
import { AutoHideCustomerHeader } from "@/shared/components/navigation/AutoHideCustomerHeader";

export function CartHeader({ onBack }: { onBack: () => void }) {
  return (
    <AutoHideCustomerHeader className="border-b border-[#E5E7EB] bg-white shadow-[0_4px_18px_rgba(26,26,26,0.04)]">
      <div className="mx-auto flex min-h-[84px] max-w-4xl items-center gap-3 px-4 py-3 md:px-6">
        <button
          type="button"
          onClick={onBack}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[#1A1A1A] transition-[background-color,scale] duration-(--dur-micro) hover:bg-[#F1F3F5] active:scale-[0.94]"
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
              Check your order before you pay
            </span>
          </span>
        </Link>
      </div>
    </AutoHideCustomerHeader>
  );
}

export default CartHeader;
