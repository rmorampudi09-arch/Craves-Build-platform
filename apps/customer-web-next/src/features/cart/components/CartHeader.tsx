import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { CravesLogo } from "@/shared/components/brand/CravesLogo";
import { AutoHideCustomerHeader } from "@/shared/components/navigation/AutoHideCustomerHeader";

/** The Banana Leaf cart's bar: back and "Cart" in the leaf serif (the page sets --font-leaf). */
export function CartHeader({ onBack }: { onBack: () => void }) {
  return (
    <AutoHideCustomerHeader className="border-b border-[#E1EAD8] bg-white">
      <div className="mx-auto flex min-h-[4.5rem] max-w-2xl items-center gap-3 px-4 py-3 md:px-6">
        <button
          type="button"
          onClick={onBack}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full !border !border-[#E1EAD8] !bg-white !text-[#1C2420] !shadow-none transition-[background-color,scale] duration-(--dur-micro) hover:!bg-[#F6F7F8] active:scale-[0.94] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#22553A]"
          aria-label="Back to discovery"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <Link to="/home" className="shrink-0 rounded-xl" aria-label="Craves home">
          <CravesLogo size="sm" decorative />
        </Link>
        <h1 className="font-[family-name:var(--font-leaf)] text-[1.75rem] leading-none text-[#22553A]">Cart</h1>
      </div>
    </AutoHideCustomerHeader>
  );
}

export default CartHeader;
