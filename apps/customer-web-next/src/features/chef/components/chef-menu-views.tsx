import Link from "next/link";
import { messages } from "@/shared/i18n/language";
import { useText } from "@/shared/i18n/language-context";

const TEXT = messages({
  en: { dishes: "Dishes", plans: "Meal plans", views: "Menu" },
  te: { dishes: "వంటకాలు", plans: "మీల్ ప్లాన్‌లు", views: "మెనూ" },
  kn: { dishes: "ಖಾದ್ಯಗಳು", plans: "ಮೀಲ್ ಪ್ಲಾನ್‌ಗಳು", views: "ಮೆನು" },
});

const VIEWS = [
  ["dishes", "/chef/menu"],
  ["plans", "/chef/menu?view=plans"],
] as const;

/** The Menu tab's Dishes / Meal plans toggle, like the app's: `Dishes · 16` once the count is known. */
export function ChefMenuViews({
  current,
  counts,
}: {
  current: "dishes" | "plans";
  counts: { dishes?: number; plans?: number };
}) {
  const text = useText(TEXT);
  return (
    <nav aria-label={text.views} className="grid grid-cols-2 border-b border-[#E3E6EA]">
      {VIEWS.map(([view, href]) => (
        <Link
          key={view}
          href={href}
          aria-current={current === view ? "page" : undefined}
          className="-mb-px flex min-h-12 items-center justify-center border-b-2 border-transparent text-[0.9375rem] font-semibold text-[#6B6B6B] aria-[current=page]:border-[#1A1A1A] aria-[current=page]:text-[#1A1A1A]"
        >
          {counts[view] === undefined ? text[view] : `${text[view]} · ${counts[view]}`}
        </Link>
      ))}
    </nav>
  );
}
