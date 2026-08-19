import { ArrowLeft, ImageOff, Share2 } from "lucide-react";
import type { Dish } from "@/services/api/dishes";

interface DishImageHeaderProps {
  dish: Dish;
  onBack: () => void;
}

export function DishImageHeader({ dish, onBack }: DishImageHeaderProps) {
  const handleShare = async () => {
    if (!navigator.share) return;
    try {
      await navigator.share({
        title: dish.name,
        text: `${dish.name} from ${dish.chef} on Craves`,
        url: window.location.href,
      });
    } catch {
      // The native share sheet can be dismissed without an application error.
    }
  };

  return (
    <header className="relative overflow-hidden bg-[#F1F3F5]">
      <div className={`mx-auto flex h-80 max-w-7xl items-center justify-center md:h-[28rem] ${dish.imageIsPlaceholder ? "bg-[#F1F3F5]" : "bg-[#E5E7EB]"}`}>
        <img
          src={dish.img}
          alt={dish.imageIsPlaceholder ? "" : dish.name}
          aria-hidden={dish.imageIsPlaceholder || undefined}
          className={
            dish.imageIsPlaceholder
              ? "h-28 w-28 object-contain opacity-80"
              : "h-full w-full object-cover"
          }
        />
        {dish.imageIsPlaceholder && (
          <span className="absolute bottom-6 inline-flex items-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-semibold text-[#6B6B6B] shadow-[0_6px_18px_rgba(26,26,26,0.08)]">
            <ImageOff className="h-4 w-4 text-[#F62E18]" aria-hidden="true" /> Kitchen image not uploaded
          </span>
        )}
      </div>
      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 md:p-6">
        <button
          type="button"
          onClick={onBack}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#1A1A1A] shadow-[0_6px_18px_rgba(26,26,26,0.12)] transition hover:text-[#F62E18]"
          aria-label="Back to discovery"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        {typeof navigator !== "undefined" && "share" in navigator && (
          <button
            type="button"
            onClick={() => void handleShare()}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#1A1A1A] shadow-[0_6px_18px_rgba(26,26,26,0.12)] transition hover:text-[#F62E18]"
            aria-label="Share this dish"
          >
            <Share2 className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </div>
    </header>
  );
}

export default DishImageHeader;
