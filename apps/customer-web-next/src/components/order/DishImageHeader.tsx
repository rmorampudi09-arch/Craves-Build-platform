import { ArrowLeft, Share2, Crown } from "lucide-react";
import { WishlistHeartButton } from "@/components/order/WishlistHeartButton";
import type { Dish } from "@/services/api/dishes";

interface DishImageHeaderProps {
  dish: Dish;
  onBack: () => void;
}

/** Full-bleed hero photo with back/share/heart buttons, gallery counter and tag badge. */
export function DishImageHeader({ dish, onBack }: DishImageHeaderProps) {
  const handleShare = async () => {
    const shareData = { title: dish.name, text: dish.desc };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // user cancelled — nothing to do
      }
    }
  };

  return (
    <div className="relative">
      <img src={dish.img} alt={dish.name} className="h-80 w-full object-cover md:h-[26rem]" />
      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-ink shadow hover:bg-white"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleShare}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-ink shadow hover:bg-white"
            aria-label="Share"
          >
            <Share2 className="h-4 w-4" />
          </button>
          <WishlistHeartButton
            item={{
              id: dish.id,
              name: dish.name,
              chef: dish.chef,
              price: dish.price,
              img: dish.img,
            }}
            size="md"
          />
        </div>
      </div>
      <span className="absolute bottom-4 left-4 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white">
       
      </span>
      {dish.tag && (
        <span className="absolute bottom-4 right-4 flex items-center gap-1 rounded-full bg-primary/95 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-primary-foreground shadow">
          <Crown className="h-3.5 w-3.5" /> {dish.tag}
        </span>
      )}
    </div>
  );
}

export default DishImageHeader;
