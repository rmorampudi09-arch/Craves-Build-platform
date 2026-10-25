import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

import { activeMenuSectionIndex, groupKitchenMenu } from "@/features/chefs/lib/kitchen-menu";
import type { Dish } from "@/features/dish/api/dishes";
import { DishCard } from "@/features/home/components/DishCard";

/** The kitchen bar (h-16) plus the category tabs; sections stop here (scroll-mt-32) and count as "reached" just below it. */
const STICKY_OFFSET = 128;

/** The menu by category, with tabs that stay under the kitchen bar, follow the scroll and jump to a category. */
export function KitchenMenu({ dishes }: { dishes: Dish[] }) {
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
        <div ref={tabsRef} className="flex gap-2 overflow-x-auto py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {sections.map((section, index) => (
            <button
              key={section.category}
              type="button"
              aria-current={index === active ? "true" : undefined}
              onClick={() => {
                setActive(index);
                sectionRefs.current[index]?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
              }}
              className={`inline-flex !min-h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-black ${index === active ? "!bg-[#1A1A1A] !text-white" : "!bg-white !text-[#1A1A1A]"}`}
            >
              {section.label}
              <span className="text-xs font-bold opacity-70">{section.dishes.length}</span>
            </button>
          ))}
        </div>
      </nav>

      {sections.map((section, index) => (
        <section key={section.category} ref={(element) => { sectionRefs.current[index] = element; }} aria-labelledby={`kitchen-menu-${index}`} className="scroll-mt-32 pt-6">
          <div className="flex items-baseline justify-between gap-3">
            <h3 id={`kitchen-menu-${index}`} className="font-display text-xl font-black tracking-[-0.03em] text-[#1A1A1A] md:text-2xl">{section.label}</h3>
            <span className="shrink-0 text-xs font-bold text-[#6B6B6B]">{section.dishes.length} {section.dishes.length === 1 ? "dish" : "dishes"}</span>
          </div>
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {section.dishes.map((dish, position) => (
              <DishCard key={dish.id} dish={dish} priorityImage={index === 0 && position < 2} />
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}
