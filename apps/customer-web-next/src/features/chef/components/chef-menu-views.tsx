import Link from "next/link";

const VIEWS = [
  ["dishes", "Dishes", "/chef/menu"],
  ["plans", "Meal plans", "/chef/menu?view=plans"],
] as const;

/** The Menu tab's Dishes / Meal plans toggle, like the app's: `Dishes · 16` once the count is known. */
export function ChefMenuViews({
  current,
  counts,
}: {
  current: "dishes" | "plans";
  counts: { dishes?: number; plans?: number };
}) {
  return (
    <nav aria-label="Menu" className="grid grid-cols-2 border-b border-[#E3E6EA]">
      {VIEWS.map(([view, label, href]) => (
        <Link
          key={view}
          href={href}
          aria-current={current === view ? "page" : undefined}
          className="-mb-px flex min-h-12 items-center justify-center border-b-2 border-transparent text-[0.9375rem] font-semibold text-[#6B6B6B] aria-[current=page]:border-[#1A1A1A] aria-[current=page]:text-[#1A1A1A]"
        >
          {counts[view] === undefined ? label : `${label} · ${counts[view]}`}
        </Link>
      ))}
    </nav>
  );
}
