import { Link } from "@tanstack/react-router";
import { FaArrowLeft, FaArrowsRotate } from "react-icons/fa6";
import { CravesLogo } from "@/shared/components/brand/CravesLogo";
import { AutoHideCustomerHeader } from "@/shared/components/navigation/AutoHideCustomerHeader";

interface TrackingHeaderProps {
  /** Already short: shortOrderNumber(id). */
  orderNumber: string;
  /** Read before the number by screen readers ("Track order, Order #…"). */
  title?: string;
  onBack: () => void;
  backLabel?: string;
  onRefresh: () => void;
  refreshing?: boolean;
}

/** The Kitchen Calendar live order's bar: back, "Order #…" in the calendar's condensed face, refresh. Light, no date block. */
export function TrackingHeader({
  orderNumber,
  title = "Track order",
  onBack,
  backLabel = "Back to orders",
  onRefresh,
  refreshing = false,
}: TrackingHeaderProps) {
  return (
    <AutoHideCustomerHeader className="border-b-2 border-[#151515] bg-white">
      <div className="mx-auto flex min-h-[4.25rem] max-w-5xl items-center gap-3 px-4 py-2.5 md:px-6">
        <button
          type="button"
          onClick={onBack}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full !bg-white !text-[#151515] !shadow-none transition-colors hover:!bg-[#F1F3F5]"
          aria-label={backLabel}
        >
          <FaArrowLeft className="text-lg" aria-hidden="true" />
        </button>

        <Link to="/home" className="shrink-0 rounded-xl" aria-label="Craves home">
          <CravesLogo size="sm" decorative />
        </Link>

        <h1 className="min-w-0 truncate font-[family-name:var(--font-calendar)] text-[1.625rem] font-semibold leading-none text-[#151515]">
          <span className="sr-only">{title}, </span>Order #{orderNumber}
        </h1>

        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full !bg-white !text-[#C8281F] !shadow-none transition-colors hover:!bg-[#F1F3F5] disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Refresh order tracking"
        >
          <FaArrowsRotate className={`text-lg ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
        </button>
      </div>
    </AutoHideCustomerHeader>
  );
}

export default TrackingHeader;
