"use client";

import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { forwardRef, useEffect, useId, useRef, useState } from "react";

const switchSizes = {
  sm: { trackX: 46, trackY: 24, thumbX: 22, thumbY: 18, padding: 3 },
  md: { trackX: 62, trackY: 30, thumbX: 32, thumbY: 24, padding: 4 },
  lg: { trackX: 74, trackY: 36, thumbX: 34, thumbY: 28, padding: 5 },
} as const;

/** "veg" is the green of the Indian veg mark; "go" the green of yes/open (View cart, Accept). */
const ON_COLOR = { flame: "#F62E18", veg: "#2E7D32", go: "#17803D" } as const;
// Mid grey (3.2:1 on white), so the white thumb and the switch edge stay visible when off.
const OFF_COLOR = "#8A8F98";

// The original Craves switch: a quick slide that settles softly, and a thumb that swells into a
// liquid drop while it is held or dragged.
const thumbSpring = { stiffness: 700, damping: 48, mass: 0.55 };
const grabSpring = { stiffness: 500, damping: 25 };

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export interface AppleSwitchProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "role"> {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: React.ReactNode;
  description?: React.ReactNode;
  size?: keyof typeof switchSizes;
  labelSide?: "left" | "right";
  tone?: keyof typeof ON_COLOR;
}

/** Tap or drag to toggle. Under reduced motion the thumb jumps and never swells. */
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
      onPointerCancel,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const switchId = id ?? generatedId;
    const reduceMotion = useReducedMotion();
    const [uncontrolledChecked, setUncontrolledChecked] = useState(Boolean(defaultChecked));
    const on = checked ?? uncontrolledChecked;
    const metrics = switchSizes[size];
    const thumbTravel = metrics.trackX - metrics.thumbX - metrics.padding * 2;

    const targetX = useMotionValue(on ? thumbTravel : 0);
    const springX = useSpring(targetX, thumbSpring);
    const thumbX = reduceMotion ? targetX : springX;
    const grabTarget = useMotionValue(0);
    const grabProgress = useSpring(grabTarget, grabSpring);
    const thumbWidth = useTransform(grabProgress, [0, 1], [metrics.thumbX, metrics.thumbX + metrics.padding * 4.5]);
    const thumbHeight = useTransform(grabProgress, [0, 1], [metrics.thumbY, metrics.thumbY + metrics.padding * 2.3]);
    // The swollen thumb grows from its centre, not its left edge.
    const thumbOffsetX = useTransform(() => thumbX.get() - (thumbWidth.get() - metrics.thumbX) / 2);
    const liquidOpacity = useTransform(grabProgress, [0, 1], [0, 0.76]);
    const liquidScale = useTransform(grabProgress, [0, 1], [0.82, 1.08]);
    const thumbOpacity = useTransform(grabProgress, [0, 1], [1, 0.2]);
    // The colour follows the thumb, so a half-dragged switch is half filled.
    const fillOpacity = useTransform(thumbX, [0, thumbTravel], [0, 1]);

    const dragStartX = useRef(0);
    const dragStartThumbX = useRef(0);
    const isDragging = useRef(false);
    const activePointerId = useRef<number | null>(null);
    const suppressNextClick = useRef(false);
    const grab = (value: number) => grabTarget.set(reduceMotion ? 0 : value);

    useEffect(() => {
      if (activePointerId.current !== null) return;
      targetX.set(on ? thumbTravel : 0);
    }, [on, thumbTravel, targetX]);

    const setChecked = (next: boolean) => {
      targetX.set(next ? thumbTravel : 0);
      if (next === on) return;
      if (checked === undefined) setUncontrolledChecked(next);
      onCheckedChange?.(next);
    };

    const finishDrag = () => {
      activePointerId.current = null;
      grab(0);
      if (!isDragging.current) return;
      isDragging.current = false;
      suppressNextClick.current = true;
      setChecked(targetX.get() >= thumbTravel / 2);
    };

    // A drag released outside the switch (or a lost window) still settles on a side.
    useEffect(() => {
      const stop = () => {
        if (activePointerId.current !== null || isDragging.current) finishDrag();
      };
      window.addEventListener("pointerup", stop);
      window.addEventListener("pointercancel", stop);
      window.addEventListener("blur", stop);
      return () => {
        window.removeEventListener("pointerup", stop);
        window.removeEventListener("pointercancel", stop);
        window.removeEventListener("blur", stop);
      };
    });

    const switchEl = (
      <button
        id={switchId}
        ref={ref}
        type={type}
        role="switch"
        aria-checked={on}
        disabled={disabled}
        onPointerDown={(event) => {
          onPointerDown?.(event);
          if (event.defaultPrevented || disabled) return;
          if (event.pointerType === "mouse" && event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          activePointerId.current = event.pointerId;
          grab(1);
          dragStartX.current = event.clientX;
          dragStartThumbX.current = thumbX.get();
          targetX.set(dragStartThumbX.current);
          isDragging.current = false;
        }}
        onPointerMove={(event) => {
          onPointerMove?.(event);
          if (event.defaultPrevented || disabled || event.pointerId !== activePointerId.current) return;
          const deltaX = event.clientX - dragStartX.current;
          if (Math.abs(deltaX) > 3) isDragging.current = true;
          if (!isDragging.current) return;
          event.preventDefault();
          targetX.set(clamp(dragStartThumbX.current + deltaX, 0, thumbTravel));
        }}
        onPointerUp={(event) => {
          onPointerUp?.(event);
          if (event.pointerId !== activePointerId.current) return;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          finishDrag();
        }}
        onPointerCancel={(event) => {
          onPointerCancel?.(event);
          activePointerId.current = null;
          isDragging.current = false;
          grab(0);
          targetX.set(on ? thumbTravel : 0);
        }}
        onClick={(event) => {
          onClick?.(event);
          if (event.defaultPrevented || disabled) return;
          // The click that ends a drag was already decided by where the thumb was let go.
          if (suppressNextClick.current) {
            suppressNextClick.current = false;
            event.preventDefault();
            return;
          }
          setChecked(!on);
        }}
        aria-label={typeof label === "string" ? label : props["aria-label"]}
        className={`relative inline-flex shrink-0 cursor-pointer items-center rounded-full !border-0 !bg-transparent !p-0 !shadow-none outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A]/40 focus-visible:ring-offset-2 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
        style={{ width: metrics.trackX, height: metrics.trackY, touchAction: "pan-y", ...style }}
        {...props}
      >
        <span className="absolute inset-0 overflow-hidden rounded-full" aria-hidden="true">
          <span
            className="absolute inset-0 rounded-full"
            style={{ backgroundColor: OFF_COLOR, boxShadow: "inset 0 1px 2px rgba(26,26,26,0.18)" }}
          />
          <motion.span className="absolute inset-0 rounded-full" style={{ backgroundColor: ON_COLOR[tone], opacity: fillOpacity }} />
        </span>

        {/* The liquid drop: a soft, frosted blob that shows through the thumb while it is held. */}
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute left-0 z-[9] block rounded-full"
          style={{
            width: thumbWidth,
            height: thumbHeight,
            x: thumbOffsetX,
            top: "50%",
            y: "-50%",
            marginLeft: metrics.padding,
            background: "rgba(255,255,255,0.82)",
            opacity: liquidOpacity,
            scale: liquidScale,
            filter: "blur(9px)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
          }}
        />

        <motion.span
          aria-hidden="true"
          className="pointer-events-none relative z-10 block rounded-full bg-white"
          style={{
            width: thumbWidth,
            height: thumbHeight,
            x: thumbOffsetX,
            marginLeft: metrics.padding,
            opacity: thumbOpacity,
            boxShadow:
              "0 3px 11px rgba(26,26,26,0.24), 0 1px 1px rgba(26,26,26,0.12), inset 0 1px 0 rgba(255,255,255,0.78), inset 0 -1px 1px rgba(26,26,26,0.05)",
          }}
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
            {description ? <span className="text-[10px] text-[#6B6B6B]">{description}</span> : null}
          </span>
        ) : null}
        {switchEl}
        {labelSide === "right" ? (
          <span className="flex flex-col">
            <span className="text-xs font-black text-[#1A1A1A]">{label}</span>
            {description ? <span className="text-[10px] text-[#6B6B6B]">{description}</span> : null}
          </span>
        ) : null}
      </label>
    );
  },
);

AppleSwitch.displayName = "AppleSwitch";
