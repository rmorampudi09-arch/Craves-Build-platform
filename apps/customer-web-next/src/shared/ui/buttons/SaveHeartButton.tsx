"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import { Heart } from "lucide-react";

/**
 * The one save heart used on every card and page (the Chefs-tab style the owner chose, 5 Nov 2026):
 * a round tile that tints on hover and presses in, and a heart that fills red with one small pop.
 * `onPhoto` gives the tile a white face and a shadow so it reads over food photos.
 */
export function SaveHeartButton({
  saved,
  disabled = false,
  label,
  onToggle,
  onPhoto = false,
  size = "md",
  title,
  className = "",
  children,
}: {
  saved: boolean;
  disabled?: boolean;
  label: string;
  onToggle: () => void;
  onPhoto?: boolean;
  size?: "sm" | "md";
  title?: string;
  className?: string;
  /** Extra content inside the button, such as a screen-reader status. */
  children?: ReactNode;
}) {
  // Pop only after a press, never for hearts that load already saved.
  const [pressed, setPressed] = useState(false);
  const box = size === "sm" ? "h-10 w-10 !min-h-10 !min-w-10" : "h-12 w-12 !min-h-12 !min-w-12";
  const icon = size === "sm" ? "h-5 w-5" : "h-6 w-6";
  const face = onPhoto
    ? "!bg-white/95 !shadow-[0_2px_10px_rgba(26,26,26,0.18)] hover:!bg-white"
    : "!bg-[#F7F5F3] !shadow-none hover:!bg-[#FDEAE8]";
  return (
    <button
      type="button"
      // Cards are links or buttons themselves: a save never opens them.
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setPressed(true);
        onToggle();
      }}
      disabled={disabled}
      aria-pressed={saved}
      aria-label={label}
      title={title ?? (saved ? "Saved" : "Save")}
      className={`flex ${box} items-center justify-center rounded-full !border-0 !p-0 ${face} transition-[background-color,scale] duration-(--dur-micro) motion-safe:active:scale-[0.94] disabled:cursor-wait disabled:!opacity-100 ${className}`}
    >
      <Heart
        // A new key replays the pop each time the heart fills.
        key={saved ? "saved" : "not-saved"}
        className={`${icon} ${saved ? "fill-[#F62E18] text-[#F62E18]" : "text-[#261A15]"} ${saved && pressed ? "motion-safe:animate-[craves-heart-pop_320ms_cubic-bezier(0.3,1.6,0.5,1)]" : ""}`}
        aria-hidden="true"
      />
      {children}
    </button>
  );
}
