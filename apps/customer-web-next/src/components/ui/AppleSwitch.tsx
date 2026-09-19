"use client";

import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import { forwardRef, useEffect, useId, useRef, useState } from "react";

const switchSizes = {
  sm: { trackX: 46, trackY: 24, thumbX: 22, thumbY: 18, padding: 3 },
  md: { trackX: 62, trackY: 30, thumbX: 32, thumbY: 24, padding: 4 },
  lg: { trackX: 74, trackY: 36, thumbX: 34, thumbY: 28, padding: 5 },
} as const;

const switchTones = {
  neutral: {
    off: "color-mix(in srgb, #F1F3F5 82%, transparent)",
    on: "#34c759",
    thumb: "#ffffff",
    glow: "color-mix(in srgb, #34c759 32%, transparent)",
  },
  accent: {
    off: "color-mix(in srgb, #F1F3F5 82%, transparent)",
    on: "#F62E18",
    thumb: "#ffffff",
    glow: "color-mix(in srgb, #F62E18 35%, transparent)",
  },
} as const;

const thumbSpring = { stiffness: 700, damping: 48, mass: 0.55 };
const grabSpring = { stiffness: 500, damping: 25 };

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
  tone?: keyof typeof switchTones;
  labelSide?: "left" | "right";
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const AppleSwitch = forwardRef<HTMLButtonElement, AppleSwitchProps>(
  (
    {
      checked,
      onCheckedChange,
      label,
      description,
      size = "sm",
      tone = "neutral",
      labelSide = "right",
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
    const [uncontrolledChecked, setUncontrolledChecked] = useState(
      Boolean(defaultChecked),
    );
    const currentChecked = checked ?? uncontrolledChecked;
    const metrics = switchSizes[size];
    const colors = switchTones[tone];
    const thumbTravel = metrics.trackX - metrics.thumbX - metrics.padding * 2;
    const targetX = useMotionValue(currentChecked ? thumbTravel : 0);
    const thumbX = useSpring(targetX, thumbSpring);
    const grabTarget = useMotionValue(0);
    const grabProgress = useSpring(grabTarget, grabSpring);
    const thumbWidth = useTransform(
      grabProgress,
      [0, 1],
      [metrics.thumbX, metrics.thumbX + metrics.padding * 4.5],
    );
    const thumbHeight = useTransform(
      grabProgress,
      [0, 1],
      [metrics.thumbY, metrics.thumbY + metrics.padding * 2.3],
    );
    const thumbOffsetX = useTransform(
      () => thumbX.get() - (thumbWidth.get() - metrics.thumbX) / 2,
    );
    const thumbOpacity = useTransform(grabProgress, [0, 1], [1, 0.3]);
    const dragStartX = useRef(0);
    const dragStartThumbX = useRef(0);
    const isDragging = useRef(false);
    const activePointerId = useRef<number | null>(null);
    const suppressNextClick = useRef(false);
    const activeProgress = useTransform(thumbX, [0, thumbTravel], [0, 1]);
    const fillOpacity = useTransform(activeProgress, [0, 1], [0, 1]);
    const glowOpacity = useTransform(activeProgress, [0, 1], [0, 0.2]);

    useEffect(() => {
      if (activePointerId.current !== null) return;
      targetX.set(currentChecked ? thumbTravel : 0);
    }, [currentChecked, thumbTravel, targetX]);

    const setChecked = (next: boolean) => {
      if (checked === undefined) setUncontrolledChecked(next);
      targetX.set(next ? thumbTravel : 0);
      if (next !== currentChecked) onCheckedChange?.(next);
    };

    const handlePointerDown = (
      event: React.PointerEvent<HTMLButtonElement>,
    ) => {
      onPointerDown?.(event);
      if (event.defaultPrevented || disabled) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      activePointerId.current = event.pointerId;
      grabTarget.set(1);
      dragStartX.current = event.clientX;
      dragStartThumbX.current = thumbX.get();
      targetX.set(dragStartThumbX.current);
      isDragging.current = false;
    };

    const handlePointerMove = (
      event: React.PointerEvent<HTMLButtonElement>,
    ) => {
      onPointerMove?.(event);
      if (event.defaultPrevented || disabled) return;
      if (
        activePointerId.current !== null &&
        event.pointerId !== activePointerId.current
      ) {
        return;
      }
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      const deltaX = event.clientX - dragStartX.current;
      if (Math.abs(deltaX) > 3) isDragging.current = true;
      if (!isDragging.current) return;
      event.preventDefault();
      targetX.set(clamp(dragStartThumbX.current + deltaX, 0, thumbTravel));
    };

    const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
      onPointerUp?.(event);
      if (
        activePointerId.current !== null &&
        event.pointerId !== activePointerId.current
      ) {
        return;
      }
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      activePointerId.current = null;
      grabTarget.set(0);
      if (!isDragging.current) return;
      isDragging.current = false;
      suppressNextClick.current = true;
      setChecked(targetX.get() >= thumbTravel / 2);
    };

    const handlePointerCancel = (
      event: React.PointerEvent<HTMLButtonElement>,
    ) => {
      onPointerCancel?.(event);
      activePointerId.current = null;
      isDragging.current = false;
      grabTarget.set(0);
      targetX.set(currentChecked ? thumbTravel : 0);
    };

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      if (event.defaultPrevented || disabled) return;
      if (suppressNextClick.current) {
        suppressNextClick.current = false;
        event.preventDefault();
        return;
      }
      setChecked(!currentChecked);
    };

    const switchEl = (
      <button
        id={switchId}
        ref={ref}
        type={type}
        role="switch"
        aria-checked={currentChecked}
        disabled={disabled}
        onClick={handleClick}
        onPointerCancel={handlePointerCancel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={`relative inline-flex shrink-0 cursor-pointer items-center rounded-full border border-white/70 bg-white shadow-inner outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/35 disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
        style={{
          width: metrics.trackX,
          height: metrics.trackY,
          touchAction: "pan-y",
          ...style,
        }}
        {...props}
      >
        <motion.span
          className="pointer-events-none absolute -inset-1 rounded-full blur-md"
          style={{ backgroundColor: colors.glow, opacity: glowOpacity }}
        />
        <span className="absolute inset-0 overflow-hidden rounded-full">
          <span
            className="absolute inset-0 rounded-full"
            style={{ backgroundColor: colors.off }}
          />
          <motion.span
            className="absolute inset-0 rounded-full"
            style={{ backgroundColor: colors.on, opacity: fillOpacity }}
          />
        </span>
        <motion.span
          className="pointer-events-none z-10 block rounded-full"
          style={{
            width: thumbWidth,
            height: thumbHeight,
            x: thumbOffsetX,
            marginLeft: metrics.padding,
            backgroundColor: colors.thumb,
            opacity: thumbOpacity,
            boxShadow:
              "0 3px 11px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.8)",
          }}
        />
      </button>
    );

    if (!label) return switchEl;

    return (
      <label
        htmlFor={switchId}
        className="inline-flex cursor-pointer select-none items-center gap-2.5"
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
