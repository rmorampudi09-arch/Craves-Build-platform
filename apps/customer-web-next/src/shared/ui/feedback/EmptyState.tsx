import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { EmptyIllustration, type EmptyIllustrationName } from "./EmptyIllustration";

/** The second button under an empty state: white with a red outline, next to `craves-primary-action`. */
export const emptyStateSecondaryAction =
  // Buttons need `!`: the global :where(button) colours are unlayered, so they beat plain utilities.
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full !border-2 !border-[#F62E18] !bg-white px-5 text-base font-bold !text-[#D92714] !shadow-none transition-colors duration-150 hover:!bg-[#FDEAE8] active:!bg-[#FBD5D0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A1A1A]";

/**
 * An empty, offline or error screen like the app's (1.35.0): the drawing, a title that says what is
 * going on, one line on what to do, then the buttons. No card around it.
 */
export function EmptyState({
  illustration,
  title,
  message,
  children,
  heading: Heading = "h2",
  compact = false,
  role,
  className,
}: {
  illustration: EmptyIllustrationName;
  title: ReactNode;
  message?: ReactNode;
  /** Buttons or links. */
  children?: ReactNode;
  heading?: "h1" | "h2" | "h3";
  /** Smaller drawing, for a state inside a section rather than the whole page. */
  compact?: boolean;
  role?: "status" | "alert";
  className?: string;
}) {
  return (
    <div role={role} className={cn("flex flex-col items-center px-4 text-center", compact ? "py-6" : "py-10 md:py-14", className)}>
      <EmptyIllustration name={illustration} className={compact ? "w-40" : "w-56 md:w-64"} />
      <Heading className="mt-4 max-w-md text-balance font-display text-xl font-bold tracking-[-0.02em] text-[#1A1A1A] md:text-2xl">
        {title}
      </Heading>
      {message ? <p className="mt-2 max-w-sm text-pretty text-[0.9375rem] leading-6 text-[#6B6B6B]">{message}</p> : null}
      {children ? <div className="mt-6 flex w-full max-w-sm flex-col items-stretch gap-3 sm:w-auto sm:max-w-none sm:flex-row sm:justify-center">{children}</div> : null}
    </div>
  );
}
