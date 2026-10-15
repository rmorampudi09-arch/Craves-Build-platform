import { ChefHat } from "lucide-react";
import { ProgressiveImage } from "@/shared/components/media/ProgressiveImage";

/** The square plan photo beside a plan's name, as in the app; a chef's hat when there is none. */
export function PlanPhoto({ src, className }: { src: string | null; className: string }) {
  return (
    <span
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#F1F3F5] ${className}`}
    >
      {src ? (
        <ProgressiveImage
          src={src}
          alt=""
          fill
          sizes="80px"
          fallbackLabel=""
          className="object-cover"
        />
      ) : (
        <ChefHat className="h-8 w-8 text-[#6B6B6B]" aria-hidden="true" />
      )}
    </span>
  );
}
