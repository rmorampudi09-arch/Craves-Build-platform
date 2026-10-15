import { useEffect, useMemo, useRef, useState, type UIEvent } from "react";
import { useReducedMotion } from "framer-motion";
import { Pause, Play } from "lucide-react";

import { fetchHomeBanners } from "@/features/home/api/home-banners";
import type { HomeBanner } from "@/features/home/lib/home-banner-contract";
import styles from "@/features/home/screens/HomeReference.module.css";
import skeletonStyles from "@/shared/components/loading/CustomerPageSkeleton.module.css";

/** How long each banner stays before the next one slides in (as in the app). */
export const BANNER_ADVANCE_MS = 4_000;

const section = `${styles.fadeUp} mx-auto max-w-[88rem] px-4 pt-3 md:px-5 md:pt-3 lg:px-10 lg:pt-4`;
// Banner art is 1500 x 750; past 64rem it would push the dishes below the fold.
const frame =
  "mx-auto aspect-[2/1] max-w-[64rem] rounded-[1.45rem] sm:rounded-[1.65rem] md:rounded-[1.7rem] lg:rounded-[2rem]";

/**
 * The promo banners admins publish: they slide on every 4 s and loop round, a tap opens search.
 * Nothing shows when there are none or they can't be loaded.
 */
export function WelcomeBanner({ onOpenSearch }: { onOpenSearch: () => void }) {
  const [banners, setBanners] = useState<HomeBanner[] | null>(null);
  // A banner whose image fails leaves the carousel instead of showing a broken picture.
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const shown = useMemo(
    () => banners?.filter((banner) => !failed.has(banner.id)) ?? [],
    [banners, failed],
  );
  const count = shown.length;
  const stripRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  // Moving banners can be paused (WCAG 2.2.2) and never move for reduced motion.
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReducedMotion();
  const autoplay = count > 1 && !reduceMotion && !paused;
  // A swipe keeps its banner for one full interval before the slides move on.
  const heldAt = useRef(0);
  const settle = useRef(0);

  useEffect(() => {
    let current = true;
    void fetchHomeBanners().then((list) => {
      if (current) setBanners(list);
    });
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || !autoplay) return;
    const advance = () => {
      // Hovering or keyboard focus holds the current banner too.
      if (
        Date.now() - heldAt.current < BANNER_ADVANCE_MS ||
        strip.closest("section")?.matches(":hover, :focus-within")
      )
        return;
      const width = strip.clientWidth;
      if (width)
        strip.scrollTo({
          left: (Math.round(strip.scrollLeft / width) + 1) * width,
          behavior: "smooth",
        });
    };
    let timer = 0;
    // A hidden tab stops the clock; it starts again when the tab is back.
    const restart = () => {
      window.clearInterval(timer);
      timer = document.hidden ? 0 : window.setInterval(advance, BANNER_ADVANCE_MS);
    };
    restart();
    document.addEventListener("visibilitychange", restart);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", restart);
    };
  }, [autoplay]);

  useEffect(() => () => window.clearTimeout(settle.current), []);

  const hold = () => {
    heldAt.current = Date.now();
  };
  const onStripScroll = (event: UIEvent<HTMLDivElement>) => {
    const strip = event.currentTarget;
    const width = strip.clientWidth;
    if (!width) return;
    setActiveIndex(Math.round(strip.scrollLeft / width) % count);
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      // Resting on the copy of the first banner: step to the real one (they look the same).
      if (Math.round(strip.scrollLeft / width) >= count)
        strip.scrollTo({ left: 0, behavior: "instant" });
    }, 140);
  };

  if (banners === null) {
    return (
      <div className={section} aria-hidden="true">
        <div className={`${skeletonStyles.block} ${frame}`} />
      </div>
    );
  }
  if (!count) return null;

  // After the last banner the first one comes round again from the right.
  const slides = count > 1 ? [...shown, shown[0]] : shown;
  const current = activeIndex % count;
  return (
    <section aria-roledescription="carousel" aria-label="Offers" className={section}>
      <div
        ref={stripRef}
        onScroll={onStripScroll}
        onTouchStart={hold}
        onTouchMove={hold}
        onTouchEnd={hold}
        onWheel={hold}
        className={`${frame} flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain border border-[#E5E7EB] bg-[#F1F3F5] shadow-[0_18px_54px_rgba(26,26,26,0.075)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
      >
        {slides.map((banner, index) => {
          const copy = index === count;
          return (
            <button
              key={copy ? `${banner.id}:loop` : banner.id}
              type="button"
              onClick={onOpenSearch}
              aria-hidden={copy || undefined}
              tabIndex={copy ? -1 : undefined}
              className="block h-full w-full shrink-0 snap-center snap-always focus-visible:!outline-offset-[-4px]"
            >
              <img
                src={banner.src}
                alt={copy ? "" : banner.label}
                loading={index === 0 ? "eager" : "lazy"}
                fetchPriority={index === 0 ? "high" : "auto"}
                decoding="async"
                draggable={false}
                onError={() => setFailed((ids) => new Set(ids).add(banner.id))}
                className="h-full w-full object-cover"
              />
            </button>
          );
        })}
      </div>

      {count > 1 ? (
        <div className="relative mx-auto flex min-h-8 max-w-[64rem] items-center justify-center pt-1">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {shown.map((banner, index) => (
              <span
                key={banner.id}
                className={`h-1.5 rounded-full transition-[width,background-color] duration-(--dur-component) motion-reduce:transition-none ${
                  index === current ? "w-4 bg-[#1A1A1A]" : "w-1.5 bg-[#D1D5DB]"
                }`}
              />
            ))}
          </div>
          {reduceMotion ? null : (
            <button
              type="button"
              onClick={() => setPaused((value) => !value)}
              aria-label={paused ? "Play banners" : "Pause banners"}
              className="absolute right-0 inline-flex h-8 w-8 items-center justify-center rounded-full text-[#6B6B6B] hover:bg-[#F1F3F5]"
            >
              {paused ? (
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Pause className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}

export default WelcomeBanner;
