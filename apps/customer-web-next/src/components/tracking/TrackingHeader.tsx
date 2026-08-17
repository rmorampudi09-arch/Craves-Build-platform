import { FaArrowLeft, FaArrowsRotate } from "react-icons/fa6";
import { CravesLogo } from "@/components/brand/CravesLogo";
import { PersistentCustomerServiceNav } from "@/components/navigation/PersistentCustomerServiceNav";

interface TrackingHeaderProps {
  orderId: string;
  onBack: () => void;
  onRefresh: () => void;
  refreshing?: boolean;
}

export function TrackingHeader({
  orderId,
  onBack,
  onRefresh,
  refreshing = false,
}: TrackingHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-[#E5E7EB] bg-white/95 backdrop-blur-xl">
      <div className="mx-auto flex min-h-[72px] max-w-5xl items-center gap-3 px-4 py-3 md:px-6">
        <button
          type="button"
          onClick={onBack}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[#1A1A1A] transition-colors hover:bg-[#F1F3F5]"
          aria-label="Back to orders"
        >
          <FaArrowLeft className="text-lg" aria-hidden="true" />
        </button>

        <CravesLogo size="sm" decorative />

        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-[-0.03em] text-[#1A1A1A]">
            Track order
          </h1>
          <p className="mt-0.5 truncate text-xs text-[#6B6B6B]">
            Order #{orderId.slice(-8).toUpperCase()}
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[#F62E18] transition-colors hover:bg-[#F1F3F5] disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Refresh order tracking"
        >
          <FaArrowsRotate
            className={`text-lg ${refreshing ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
        </button>
      </div>

      <div className="mx-auto max-w-5xl px-4 pb-3 md:px-6">
        <PersistentCustomerServiceNav />
      </div>
    </header>
  );
}

export default TrackingHeader;
