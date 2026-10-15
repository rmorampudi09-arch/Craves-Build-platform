"use client";

import { useState } from "react";
import { ChefHat } from "lucide-react";
import { chefInitials, safeChefPhotoUrl } from "@/shared/lib/chef-photo";
import { cn } from "@/shared/lib/utils";

/** A chef's drawn avatar (chefs never upload real faces): the picture, else their initials, else a chef hat. */
export function ChefFace({ photoUrl, name, size = 40, className, decorative = true }: { photoUrl?: string | null; name?: string | null; size?: number; className?: string; decorative?: boolean }) {
  // Remember which url failed, so a new url gets its own try.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = safeChefPhotoUrl(photoUrl);
  const initials = chefInitials(name);
  const label = name?.trim() ? `${name.trim()}'s chef picture` : "Chef picture";
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#F1F3F5] font-semibold text-[#1A1A1A]", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      {...(decorative ? { "aria-hidden": true } : url && url !== failedUrl ? {} : { role: "img", "aria-label": label })}
    >
      {url && url !== failedUrl ? (
        <img src={url} alt={decorative ? "" : label} loading="lazy" decoding="async" draggable={false} className="h-full w-full object-cover" onError={() => setFailedUrl(url)} />
      ) : initials || <ChefHat className="h-1/2 w-1/2" aria-hidden="true" />}
    </span>
  );
}
