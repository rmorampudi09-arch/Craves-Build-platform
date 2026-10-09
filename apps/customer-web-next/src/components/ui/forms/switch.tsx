import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

/**
 * Craves toggle: grey track when off, Craves red when on; the knob carries the Craves logo.
 * Colours are explicit: `bg-input` is not a generated theme colour (the old track was transparent),
 * Chef pages restyle any button whose class contains `bg-primary` or `bg-[#F62E18]`, and the unlayered
 * `:where(button)` theme rule outranks layered utilities, so the track colours are marked important.
 */
const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer group inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border border-transparent p-0.5 shadow-inner transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-[var(--color-flame-red)]! data-[state=checked]:bg-[var(--color-flame-red)]! data-[state=unchecked]:border-[#C9CDD2]! data-[state=unchecked]:bg-[#E5E7EB]!",
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb className="pointer-events-none flex size-6 items-center justify-center overflow-hidden rounded-full bg-white shadow-md ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0">
      <img
        src="/brand/craves-logo-20260805.png"
        alt=""
        aria-hidden="true"
        className="size-4 rounded-[4px] object-contain opacity-50 grayscale transition group-data-[state=checked]:opacity-100 group-data-[state=checked]:grayscale-0"
      />
    </SwitchPrimitives.Thumb>
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
