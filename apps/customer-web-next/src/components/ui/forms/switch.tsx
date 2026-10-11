import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

/**
 * Craves toggle: mid-grey track when off (3.2:1 on white, so "off" is still visibly a switch),
 * Craves red when on, a plain white knob that slides.
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
      "peer group inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border border-transparent p-0.5 shadow-inner transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-[var(--color-flame-red)]! data-[state=checked]:bg-[var(--color-flame-red)]! data-[state=unchecked]:border-[#8A8F98]! data-[state=unchecked]:bg-[#8A8F98]!",
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb className="pointer-events-none block size-6 rounded-full bg-white shadow-[0_1px_3px_rgba(26,26,26,0.25)] ring-0 transition-[translate] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0" />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
