import { useMemo, useRef, useState, type UIEvent } from "react";
import { useReducedMotion } from "framer-motion";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";

import { FavoriteKitchenHeart } from "@/shared/ui/buttons/FavoriteKitchenHeart";
import { ChefFace } from "@/shared/ui/data-display/ChefFace";

const roundButton = "flex h-10 w-10 shrink-0 items-center justify-center rounded-full !border-0 !bg-white !p-0 text-[#1A1A1A] !shadow-[0_2px_8px_rgba(26,26,26,0.16)]";

/**
 * The kitchen's photos, whole (never cropped), side by side: people swipe, or tap a dot or arrow.
 * They never move on their own (owner, 5 Nov 2026), so there is no pause button. On wide screens a
 * soft, blurred copy of the same photo fills the sides instead of grey bars.
 */
function KitchenPhotos({ name, photos }: { name: string; photos: string[] }) {
  const reduceMotion = useReducedMotion();
  // A photo that fails to load leaves the strip instead of showing a broken image.
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const usable = useMemo(() => photos.filter((url) => !failed.has(url)), [photos, failed]);
  const drop = (src: string) => () => setFailed((value) => new Set(value).add(src));
  const [index, setIndex] = useState(0);
  const stripRef = useRef<HTMLDivElement>(null);
  const count = usable.length;
  const current = Math.min(index, Math.max(count - 1, 0));

  // No photos: a plain band just tall enough that the chef face starts below Back and the heart.
  if (!count) return <div className="h-28 bg-[#F1F3F5]" />;

  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const width = event.currentTarget.clientWidth;
    if (width) setIndex(Math.min(count - 1, Math.round(event.currentTarget.scrollLeft / width)));
  };
  const show = (next: number) => {
    const strip = stripRef.current;
    if (strip?.clientWidth) strip.scrollTo({ left: next * strip.clientWidth, behavior: reduceMotion ? "instant" : "smooth" });
  };
  const arrow = "absolute top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full !border-0 !bg-white/90 !p-0 text-[#1A1A1A] !shadow-[0_2px_10px_rgba(26,26,26,0.18)] hover:!bg-white md:flex";

  return (
    <section aria-roledescription="carousel" aria-label={`${name} kitchen photos`} className="relative h-[75vw] max-h-[28rem] w-full overflow-hidden bg-[#F1F3F5]">
      <div
        ref={stripRef}
        onScroll={onScroll}
        className="flex h-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {usable.map((src, position) => (
          <div key={src} className="relative h-full w-full shrink-0 snap-center snap-always overflow-hidden">
            {/* Wider than 4:3 (from sm), the photo's own colours, blurred, fill the sides: no grey bars. */}
            <img src={src} alt="" aria-hidden="true" loading="lazy" decoding="async" draggable={false} onError={drop(src)} className="absolute inset-0 hidden h-full w-full scale-110 object-cover opacity-80 blur-2xl sm:block" />
            <img
              src={src}
              alt={`${name} kitchen photo ${position + 1} of ${count}`}
              loading={position === 0 ? "eager" : "lazy"}
              fetchPriority={position === 0 ? "high" : "auto"}
              decoding="async"
              draggable={false}
              onError={drop(src)}
              className="relative h-full w-full object-contain"
            />
          </div>
        ))}
      </div>
      {count > 1 ? (
        <>
          <button type="button" onClick={() => show(current - 1)} disabled={current === 0} aria-label="Previous photo" className={`${arrow} left-4 lg:left-8 ${current === 0 ? "invisible" : ""}`}>
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => show(current + 1)} disabled={current === count - 1} aria-label="Next photo" className={`${arrow} right-4 lg:right-8 ${current === count - 1 ? "invisible" : ""}`}>
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="absolute bottom-3 right-3 z-10 flex items-center rounded-full bg-[#1A1A1A]/45 px-1.5 backdrop-blur-sm md:right-6">
            {usable.map((src, position) => (
              <button
                key={src}
                type="button"
                onClick={() => show(position)}
                aria-label={`Show photo ${position + 1} of ${count}`}
                aria-current={position === current ? "true" : undefined}
                className="flex h-7 min-w-5 items-center justify-center !border-0 !bg-transparent !p-0 !shadow-none"
              >
                <span aria-hidden="true" className={`h-1.5 rounded-full bg-white transition-[width,opacity] duration-300 motion-reduce:transition-none ${position === current ? "w-4" : "w-1.5 opacity-60"}`} />
              </button>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

/**
 * The kitchen page top: its photos edge to edge with Back and the heart over them, in a bar that
 * turns white and shows the chef face and name once the kitchen's name has scrolled under it.
 */
export function KitchenHeader({ kitchenId, name, chefPhotoUrl, photos, solid, onBack }: {
  kitchenId: string;
  name: string;
  chefPhotoUrl: string | null | undefined;
  photos: string[];
  solid: boolean;
  onBack: () => void;
}) {
  return (
    <>
      <header className={`fixed inset-x-0 top-0 z-40 transition-[background-color,box-shadow] duration-200 motion-reduce:transition-none ${solid ? "bg-white shadow-[0_1px_0_#E5E7EB,0_7px_22px_rgba(26,26,26,0.065)]" : ""}`}>
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-2.5 px-4 md:px-6">
          <button type="button" onClick={onBack} aria-label="Back" className={roundButton}>
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          {/* A visual echo of the page's h1, so screen readers skip it. */}
          <div aria-hidden="true" className={`flex min-w-0 flex-1 items-center gap-2 transition-opacity duration-200 motion-reduce:transition-none ${solid ? "opacity-100" : "opacity-0"}`}>
            <ChefFace photoUrl={chefPhotoUrl} name={name} size={32} />
            <span className="truncate font-display text-base font-black text-[#1A1A1A]">{name}</span>
          </div>
          <FavoriteKitchenHeart kitchenId={kitchenId} kitchenName={name} size="sm" onPhoto className="shrink-0" />
        </div>
      </header>
      <KitchenPhotos name={name} photos={photos} />
    </>
  );
}
