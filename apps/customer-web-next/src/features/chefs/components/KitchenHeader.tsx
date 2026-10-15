import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { ArrowLeft, Pause, Play } from "lucide-react";

import { FavoriteKitchenHeart } from "@/shared/ui/buttons/FavoriteKitchenHeart";
import { ChefFace } from "@/shared/ui/data-display/ChefFace";

/** Each kitchen photo stays this long before the next fades in (as in the app). */
const SLIDE_MS = 4_000;
const DOTS = 5;
const roundButton = "flex h-10 w-10 shrink-0 items-center justify-center rounded-full !border-0 !bg-white !p-0 text-[#1A1A1A] !shadow-[0_2px_8px_rgba(26,26,26,0.16)]";

/** The kitchen's 4:3 photos, whole (never cropped) on a neutral backdrop, one after another. */
function KitchenPhotos({ name, photos }: { name: string; photos: string[] }) {
  // Moving photos can be paused (WCAG 2.2.2) and never move for reduced motion.
  const reduceMotion = useReducedMotion();
  const [paused, setPaused] = useState(false);
  // A photo that fails to load leaves the slideshow instead of showing a broken image.
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const usable = useMemo(() => photos.filter((url) => !failed.has(url)), [photos, failed]);
  const [index, setIndex] = useState(0);
  const rootRef = useRef<HTMLElement>(null);
  const count = usable.length;
  const current = count ? index % count : 0;

  useEffect(() => {
    if (reduceMotion || paused || count < 2) return;
    const timer = window.setInterval(() => {
      // A hidden tab, a pointer over the photos or keyboard focus in them holds the current one.
      if (document.hidden || rootRef.current?.matches(":hover, :focus-within")) return;
      setIndex((value) => (value + 1) % count);
    }, SLIDE_MS);
    return () => window.clearInterval(timer);
  }, [count, paused, reduceMotion]);

  if (!count) return <div className="h-24 bg-[#F1F3F5] sm:h-28" />;

  const firstDot = Math.max(0, Math.min(current - 2, count - DOTS));
  return (
    <section ref={rootRef} aria-roledescription="carousel" aria-label={`${name} kitchen photos`} className="relative h-[75vw] max-h-[28rem] w-full overflow-hidden bg-[#F1F3F5]">
      {usable.map((src, position) => (
        <img
          key={src}
          src={src}
          alt={`${name} kitchen photo ${position + 1} of ${count}`}
          aria-hidden={position === current ? undefined : true}
          loading={position === 0 ? "eager" : "lazy"}
          fetchPriority={position === 0 ? "high" : "auto"}
          decoding="async"
          draggable={false}
          onError={() => setFailed((value) => new Set(value).add(src))}
          className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-700 ease-in-out motion-reduce:transition-none ${position === current ? "opacity-100" : "opacity-0"}`}
        />
      ))}
      {count > 1 ? (
        <div className={`absolute bottom-3 right-3 z-10 flex min-h-8 items-center gap-1.5 rounded-full bg-[#1A1A1A]/45 pl-3 backdrop-blur-sm md:right-6 ${reduceMotion ? "pr-3" : "pr-0"}`}>
          {usable.slice(firstDot, firstDot + DOTS).map((src, position) => (
            <span
              key={src}
              aria-hidden="true"
              className={`h-1.5 rounded-full bg-white transition-[width,opacity] duration-300 motion-reduce:transition-none ${firstDot + position === current ? "w-4" : "w-1.5 opacity-60"}`}
            />
          ))}
          {reduceMotion ? null : (
            <button
              type="button"
              onClick={() => setPaused((value) => !value)}
              aria-label={paused ? "Play kitchen photos" : "Pause kitchen photos"}
              className="flex h-8 w-8 items-center justify-center rounded-full !border-0 !bg-transparent !p-0 !min-h-0 !min-w-0 text-white !shadow-none"
            >
              {paused ? <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" /> : <Pause className="h-3.5 w-3.5 fill-current" aria-hidden="true" />}
            </button>
          )}
        </div>
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
          <FavoriteKitchenHeart kitchenId={kitchenId} kitchenName={name} className="shrink-0 !h-10 !w-10" />
        </div>
      </header>
      <KitchenPhotos name={name} photos={photos} />
    </>
  );
}
