import type { ReactNode } from "react";

export function ChefPageHeader({eyebrow,title,description,action}:{eyebrow:string;title:string;description:string;action?:ReactNode}) {
  return <header className="rounded-2xl border border-[#E5E7EB] bg-white p-5 text-[#1A1A1A] shadow-[var(--shadow-card)] sm:p-6 md:p-8">
    <div className="flex flex-wrap items-start justify-between gap-5 md:items-end">
      <div className="max-w-3xl">
        <p className="craves-overline text-[var(--color-flame-red)]">{eyebrow}</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-[-0.045em] text-[#1A1A1A] md:text-4xl">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-[#6B6B6B] md:text-base">{description}</p>
      </div>
      {action ? <div className="w-full shrink-0 sm:w-auto">{action}</div> : null}
    </div>
  </header>;
}
export default ChefPageHeader;
