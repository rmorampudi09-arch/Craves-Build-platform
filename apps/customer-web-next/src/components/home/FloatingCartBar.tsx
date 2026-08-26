import { CravesCartIcon } from "@/components/home/CravesCartIcon";

interface FloatingCartBarProps {
  itemCount: number;
  total: number;
  currency: string;
  onViewCart: () => void;
}

export function FloatingCartBar({
  itemCount,
  onViewCart,
}: FloatingCartBarProps) {
  if (itemCount <= 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 -translate-x-1/2 px-3 sm:bottom-6">
      <button
        type="button"
        onClick={onViewCart}
        className="pointer-events-auto inline-flex min-h-12 max-w-[calc(100vw-1.5rem)] items-center gap-2.5 whitespace-nowrap rounded-full !border !border-[#E5E7EB] !bg-white px-4 py-2.5 text-sm font-bold !text-[#1A1A1A] shadow-[0_8px_24px_rgba(26,26,26,0.12)] transition-shadow hover:shadow-[0_10px_28px_rgba(26,26,26,0.16)] sm:px-5"
        aria-label={`View cart with ${itemCount} ${itemCount === 1 ? "item" : "items"}`}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
          <CravesCartIcon className="h-4 w-4" />
        </span>
        <span>
          {itemCount} {itemCount === 1 ? "item" : "items"} in cart
        </span>
        <span className="text-[#6B6B6B]">·</span>
        <span>View Cart →</span>
      </button>
    </div>
  );
}

export default FloatingCartBar;
