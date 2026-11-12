import { useEffect, useMemo, useRef, useState, type UIEvent } from "react";
import { useReducedMotion } from "framer-motion";

import { fetchHomeBanners } from "@/features/home/api/home-banners";
import type { HomeBanner } from "@/features/home/lib/home-banner-contract";
import styles from "@/features/home/screens/HomeReference.module.css";

const section = `${styles.fadeUp} mx-auto max-w-[88rem] px-4 pt-3 md:px-5 md:pt-3 lg:px-10 lg:pt-4`;
// Banner art is 1500 x 750; past 64rem it would push the dishes below the fold.
const frame =
  "mx-auto aspect-[2/1] max-w-[64rem] rounded-[1.45rem] sm:rounded-[1.65rem] md:rounded-[1.7rem] lg:rounded-[2rem]";

/**
 * The promo banners admins publish. They never move on their own (owner, 5 Nov 2026), so there is
 * no pause button to need: people swipe, or tap a dot. A tap on a banner opens search.
 * Nothing shows while they load (as in the app), when there are none or when they can't be loaded.
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
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    let current = true;
    void fetchHomeBanners().then((list) => {
      if (current) setBanners(list);
    });
    return () => {
      current = false;
    };
  }, []);

  const onStripScroll = (event: UIEvent<HTMLDivElement>) => {
    const strip = event.currentTarget;
    const width = strip.clientWidth;
    if (width) setActiveIndex(Math.min(count - 1, Math.round(strip.scrollLeft / width)));
  };
  const showBanner = (index: number) => {
    const strip = stripRef.current;
    if (strip?.clientWidth)
      strip.scrollTo({ left: index * strip.clientWidth, behavior: reduceMotion ? "instant" : "smooth" });
  };

  if (!count) return null;

  const current = Math.min(activeIndex, count - 1);
  return (
    <section aria-roledescription="carousel" aria-label="Offers" className={section}>
      <div
        ref={stripRef}
        onScroll={onStripScroll}
        className={`${frame} flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain border border-[#E5E7EB] bg-[#F1F3F5] shadow-[0_18px_54px_rgba(26,26,26,0.075)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
      >
        {shown.map((banner, index) => (
          <button
            key={banner.id}
            type="button"
            onClick={onOpenSearch}
            className="block h-full w-full shrink-0 snap-center snap-always focus-visible:!outline-offset-[-4px]"
          >
            <img
              src={banner.src}
              alt={banner.label}
              loading={index === 0 ? "eager" : "lazy"}
              fetchPriority={index === 0 ? "high" : "auto"}
              decoding="async"
              draggable={false}
              onError={() => setFailed((ids) => new Set(ids).add(banner.id))}
              className="h-full w-full object-cover"
            />
          </button>
        ))}
      </div>

      {count > 1 ? (
        <div className="mx-auto flex min-h-8 max-w-[64rem] items-center justify-center pt-1">
          {shown.map((banner, index) => (
            <button
              key={banner.id}
              type="button"
              onClick={() => showBanner(index)}
              aria-label={`Show banner ${index + 1} of ${count}`}
              aria-current={index === current ? "true" : undefined}
              className="group inline-flex h-6 min-w-6 items-center justify-center !border-0 !bg-transparent !p-0 !shadow-none"
            >
              <span
                aria-hidden="true"
                className={`h-1.5 rounded-full transition-[width,background-color] duration-(--dur-component) motion-reduce:transition-none ${
                  index === current ? "w-4 bg-[#1A1A1A]" : "w-1.5 bg-[#D1D5DB] group-hover:bg-[#9CA3AF]"
                }`}
              />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export default WelcomeBanner;
