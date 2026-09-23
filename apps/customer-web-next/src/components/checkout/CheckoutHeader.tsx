import { Link } from "@tanstack/react-router";
import { FaArrowLeft, FaLock } from "react-icons/fa6";
import { CravesLogo } from "@/components/brand/CravesLogo";
import { AutoHideCustomerHeader } from "@/components/navigation/AutoHideCustomerHeader";

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
    <AutoHideCustomerHeader className="border-b border-[#E5E7EB] bg-white/95 shadow-[0_4px_18px_rgba(26,26,26,0.04)] backdrop-blur-xl">
      <div className="mx-auto flex min-h-[72px] max-w-[1180px] items-center gap-3 px-4 py-3 md:px-6 lg:min-h-[76px] lg:px-8">
        <button
          type="button"
          onClick={onBack}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[#1A1A1A] transition-colors hover:bg-[#F1F3F5]"
          aria-label="Go back"
        >
          <FaArrowLeft className="text-lg" aria-hidden="true" />
        </button>
        <Link
          to="/home"
          className="shrink-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/30"
          aria-label="Craves home"
        >
          <CravesLogo size="sm" decorative />
        </Link>
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
    </AutoHideCustomerHeader>
  );
}

export default CheckoutHeader;
