import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

import { KitchenMenuRow } from "@/features/chefs/components/KitchenMenuRow";
import { activeMenuSectionIndex, groupKitchenMenu } from "@/features/chefs/lib/kitchen-menu";
import type { Dish } from "@/features/dish/api/dishes";

/** The kitchen bar (h-16) plus the category tabs (h-12); sections stop here (scroll-mt-28) and count as "reached" just below it. */
const STICKY_OFFSET = 112;

/**
 * The menu by category, as compact rows like the app (two columns of rows on wide screens), with
 * red-underlined tabs that stay under the kitchen bar, follow the scroll and jump to a category.
 */
export function KitchenMenu({ dishes, orderable = true }: { dishes: Dish[]; orderable?: boolean }) {
  const sections = useMemo(() => groupKitchenMenu(dishes), [dishes]);
  const [active, setActive] = useState(0);
  const tabsRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      // The last categories may be too short to reach the tabs, so the end of the page selects the last one.
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      setActive(atEnd ? sections.length - 1 : activeMenuSectionIndex(sectionRefs.current.slice(0, sections.length).map((section) => section?.getBoundingClientRect().top ?? Infinity), STICKY_OFFSET + 1));
    };
    const schedule = () => { frame ||= window.requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.cancelAnimationFrame(frame);
    };
  }, [sections]);

  // Keep the highlighted tab in view when the tabs overflow the screen.
  useEffect(() => {
    const tabs = tabsRef.current;
    const tab = tabs?.children[active];
    if (tabs && tab instanceof HTMLElement) tabs.scrollTo({ left: Math.max(0, tab.offsetLeft - 16), behavior: reduceMotion ? "auto" : "smooth" });
  }, [active, reduceMotion]);

  return (
    <section className="mt-6" aria-labelledby="kitchen-menu-heading">
      <h2 id="kitchen-menu-heading" className="sr-only">Menu</h2>
      <nav aria-label="Menu categories" className="sticky top-16 z-30 -mx-4 border-b border-[#E5E7EB] bg-white px-4 md:-mx-6 md:px-6">
        <div ref={tabsRef} className="flex gap-6 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {sections.map((section, index) => (
            <button
              key={section.category}
              type="button"
              aria-current={index === active ? "true" : undefined}
              onClick={() => {
                setActive(index);
                sectionRefs.current[index]?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
              }}
              // The underline is drawn by ::after: every button's own border is reset site-wide.
              className={`relative inline-flex h-12 !min-h-12 shrink-0 items-center gap-1.5 !rounded-none !border-0 !bg-transparent !px-0.5 text-[1.0625rem] !shadow-none after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:rounded-full ${index === active ? "font-bold !text-[#261A15] after:bg-[#D92714]" : "font-semibold !text-[#706864] hover:!text-[#261A15]"}`}
            >
              {section.label}
              <span className="text-[0.9375rem] font-normal text-[#706864]">{section.dishes.length}</span>
            </button>
          ))}
        </div>
      </nav>

      {sections.map((section, index) => (
        <section key={section.category} ref={(element) => { sectionRefs.current[index] = element; }} aria-labelledby={`kitchen-menu-${index}`} className="scroll-mt-28 pt-5">
          <div className="flex items-baseline gap-2">
            <h3 id={`kitchen-menu-${index}`} className="font-display text-xl font-extrabold text-[#261A15]">{section.label}</h3>
            <span className="text-[0.9375rem] text-[#706864]">{section.dishes.length} {section.dishes.length === 1 ? "dish" : "dishes"}</span>
          </div>
          <div className="mt-2 grid md:grid-cols-2 md:gap-x-10">
            {section.dishes.map((dish, position) => (
              <KitchenMenuRow key={dish.id} dish={dish} orderable={orderable} priorityImage={index === 0 && position < 2} />
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}
