/**
 * Deep-red outline (the owner's choice for actions, 5 Nov 2026) and a quiet text button, both 44 px tall. The `!` classes win
 * over the site-wide button skin (white fill, border and shadow), as CartStepper's do.
 */
export const outlineButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full !bg-white px-5 text-[0.9375rem] font-bold !text-[#C92716] !shadow-[inset_0_0_0_1.5px_#C92716] transition-colors hover:!bg-[#FDEAE8] disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A1A1A]";

export const quietButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full !border-0 !bg-transparent px-4 text-[0.9375rem] font-bold text-[#1A1A1A] !shadow-none transition-colors hover:!bg-[#F1F3F5] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A1A1A]";
