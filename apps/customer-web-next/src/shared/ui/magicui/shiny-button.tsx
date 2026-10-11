"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface ShinyButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

export function ShinyButton({
  children,
  className = "",
  type = "button",
  ...props
}: ShinyButtonProps) {
  return (
    <button
      type={type}
      className={`group/shiny relative isolate overflow-hidden rounded-full border border-white bg-white/90 font-black text-[#1A1A1A] shadow-[inset_0_1px_0_rgba(255,255,255,1),0_6px_18px_rgba(26,26,26,0.08)] transition-[border-color,box-shadow,transform] duration-200 hover:border-[#F62E18]/25 hover:shadow-[0_10px_24px_rgba(246,46,24,0.14)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/35 motion-reduce:transform-none ${className}`}
      {...props}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/90 to-transparent opacity-0 transition-[left,opacity] duration-700 ease-out group-hover/shiny:left-[120%] group-hover/shiny:opacity-100 motion-reduce:hidden"
      />
      <span className="relative z-10">{children}</span>
    </button>
  );
}
