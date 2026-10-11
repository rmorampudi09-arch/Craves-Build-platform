"use client";

import { motion, useReducedMotion } from "framer-motion";
import { forwardRef, useId, useState } from "react";

import { spring } from "@/lib/motion";

const switchSizes = {
  sm: { trackX: 46, trackY: 24, thumbX: 22, thumbY: 18, padding: 3 },
  md: { trackX: 62, trackY: 30, thumbX: 32, thumbY: 24, padding: 4 },
  lg: { trackX: 74, trackY: 36, thumbX: 34, thumbY: 28, padding: 5 },
} as const;

export interface AppleSwitchProps
  extends Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    "onChange" | "role"
  > {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: React.ReactNode;
  description?: React.ReactNode;
  size?: keyof typeof switchSizes;
  labelSide?: "left" | "right";
  /** "veg" uses the green of the Indian veg mark when on; "go" the green of yes/open (View cart, Accept). */
  tone?: "flame" | "veg" | "go";
}

/** A tap toggles; the thumb slides on x only, with no overshoot (and jumps under reduced motion).
 * The off track is mid grey (3.2:1 on white) so the white thumb and the switch edge stay visible. */
export const AppleSwitch = forwardRef<HTMLButtonElement, AppleSwitchProps>(
  (
    {
      checked,
      onCheckedChange,
      label,
      description,
      size = "sm",
      labelSide = "right",
      tone = "flame",
      className = "",
      style,
      disabled,
      defaultChecked,
      id,
      type = "button",
      onClick,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const switchId = id ?? generatedId;
    const reduceMotion = useReducedMotion();
    const [uncontrolledChecked, setUncontrolledChecked] = useState(
      Boolean(defaultChecked),
    );
    const on = checked ?? uncontrolledChecked;
    const metrics = switchSizes[size];
    const thumbTravel = metrics.trackX - metrics.thumbX - metrics.padding * 2;

    const switchEl = (
      <button
        id={switchId}
        ref={ref}
        type={type}
        role="switch"
        aria-checked={on}
        disabled={disabled}
        onClick={(event) => {
          onClick?.(event);
          if (event.defaultPrevented || disabled) return;
          if (checked === undefined) setUncontrolledChecked(!on);
          onCheckedChange?.(!on);
        }}
        aria-label={typeof label === "string" ? label : props["aria-label"]}
        className={`relative inline-flex shrink-0 cursor-pointer items-center rounded-full !border-0 !shadow-none outline-none transition-[background-color] duration-(--dur-component) disabled:cursor-not-allowed disabled:opacity-45 ${
          on ? (tone === "veg" ? "!bg-[#2E7D32]" : tone === "go" ? "!bg-[#17803D]" : "!bg-[#F62E18]") : "!bg-[#8A8F98]"
        } ${className}`}
        style={{
          width: metrics.trackX,
          height: metrics.trackY,
          ...style,
        }}
        {...props}
      >
        <motion.span
          className="pointer-events-none block rounded-full bg-white shadow-[0_2px_6px_rgba(26,26,26,0.22)]"
          style={{
            width: metrics.thumbX,
            height: metrics.thumbY,
            marginLeft: metrics.padding,
          }}
          initial={false}
          animate={{ x: on ? thumbTravel : 0 }}
          transition={reduceMotion ? { duration: 0 } : spring.ui}
        />
      </button>
    );

    if (!label) return switchEl;

    return (
      <label
        htmlFor={switchId}
        className={`inline-flex cursor-pointer select-none items-center gap-2.5 ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
      >
        {labelSide === "left" ? (
          <span className="flex flex-col text-right">
            <span className="text-xs font-black text-[#1A1A1A]">{label}</span>
            {description ? (
              <span className="text-[10px] text-[#6B6B6B]">{description}</span>
            ) : null}
          </span>
        ) : null}
        {switchEl}
        {labelSide === "right" ? (
          <span className="flex flex-col">
            <span className="text-xs font-black text-[#1A1A1A]">{label}</span>
            {description ? (
              <span className="text-[10px] text-[#6B6B6B]">{description}</span>
            ) : null}
          </span>
        ) : null}
      </label>
    );
  },
);

AppleSwitch.displayName = "AppleSwitch";
