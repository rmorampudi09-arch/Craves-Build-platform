import { FaArrowLeft, FaLock } from "react-icons/fa6";
import { CravesLogo } from "@/components/brand/CravesLogo";
import { PersistentCustomerServiceNav } from "@/components/navigation/PersistentCustomerServiceNav";

export function CheckoutHeader({
  onBack,
  title = "Checkout",
  subtitle = "Secure Craves checkout",
}: {
  onBack: () => void;
  title?: string;
  subtitle?: string;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-[#E5E7EB] bg-white/95 backdrop-blur-xl">
      <div className="mx-auto flex min-h-[84px] max-w-4xl items-center gap-3 px-4 py-3 md:px-6">
        <button
          type="button"
          onClick={onBack}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[#1A1A1A] transition-colors hover:bg-[#F1F3F5]"
          aria-label="Go back"
        >
          <FaArrowLeft className="text-lg" aria-hidden="true" />
        </button>
        <CravesLogo size="sm" decorative />
        <div className="min-w-0">
          <h1 className="truncate font-display text-lg font-bold tracking-[-0.03em] text-[#1A1A1A]">
            {title}
          </h1>
          <p className="flex items-center gap-1.5 text-xs text-[#6B6B6B]">
            <FaLock className="text-[11px] text-[#1A1A1A]" aria-hidden="true" />
            {subtitle}
          </p>
        </div>
      </div>
      <div className="mx-auto max-w-4xl px-4 pb-3 md:px-6">
        <PersistentCustomerServiceNav />
      </div>
    </header>
  );
}

export default CheckoutHeader;
