"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, Utensils } from "lucide-react";
import type { HomeFoodPreference } from "@/features/home/lib/home-return-state";
import { cn } from "@/shared/lib/utils";

const OPTIONS: readonly { value: HomeFoodPreference; label: string; short: string }[] = [
  { value: "all", label: "All food", short: "All" },
  { value: "veg", label: "Veg only", short: "Veg" },
  { value: "egg", label: "Egg", short: "Egg" },
  { value: "non-veg", label: "Non-veg", short: "Non-veg" },
];

// The same greens, ambers and reds as the marks on dish cards.
const TONES: Record<Exclude<HomeFoodPreference, "all">, { mark: string; pill: string; row: string }> = {
  veg: { mark: "border-[#2E7D32] [--dot:#2E7D32]", pill: "!border-[#2E7D32] !bg-[#E8F7F1] !text-[#166B49]", row: "bg-[#E8F7F1]" },
  egg: { mark: "border-[#D99A00] [--dot:#D99A00]", pill: "!border-[#D98C16] !bg-[#FFF4DF] !text-[#7A4A00]", row: "bg-[#FFF4DF]" },
  "non-veg": { mark: "border-[#D92D20] [--dot:#D92D20]", pill: "!border-[#C72C21] !bg-[#FDEAE8] !text-[#C72C21]", row: "bg-[#FDEAE8]" },
};

/** The square-and-dot mark Indian menus print beside a dish. */
export function FoodTypeMark({ type }: { type: Exclude<HomeFoodPreference, "all"> }) {
  return (
    <span aria-hidden="true" className={cn("flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border-[1.5px] bg-white", TONES[type].mark)}>
      <span className="h-1.5 w-1.5 rounded-full bg-(--dot)" />
    </span>
  );
}

/**
 * Veg, Egg or Non-veg beside the Home search (app 1.34.7). It sets the same choice as Filter & sort,
 * so the two never disagree. `onRed` is the white-on-red look of the Craves red Home top.
 */
export function FoodTypeMenu({
  value,
  onChange,
  tone = "light",
  className,
}: {
  value: HomeFoodPreference;
  onChange: (next: HomeFoodPreference) => void;
  tone?: "light" | "onRed";
  className?: string;
}) {
  const current = OPTIONS.find((option) => option.value === value) ?? OPTIONS[0];
  const chosen = value === "all" ? null : TONES[value];
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger
        aria-label={`Food type: ${current.value === "all" ? "all food" : current.label}`}
        className={cn(
          "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-[background-color,border-color,scale] duration-150 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A1A1A] !shadow-none data-[state=open]:!border-[#1A1A1A]",
          chosen
            ? chosen.pill
            : tone === "onRed"
              ? "!border-white !bg-white !text-[#1A1A1A] hover:!bg-[#FFF5F3]"
              : "!border-[#E5E7EB] !bg-white !text-[#1A1A1A] hover:!border-[#D3D7DD]",
          className,
        )}
        data-testid="home-food-type-pill"
      >
        {value === "all" ? <Utensils className="h-4 w-4 text-[#D92714]" aria-hidden="true" /> : <FoodTypeMark type={value} />}
        <span>{current.short}</span>
        <ChevronDown className="h-4 w-4 opacity-70" aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={6}
          className="z-[70] w-48 rounded-2xl border border-[#E5E7EB] bg-white p-1.5 text-[#1A1A1A] shadow-[0_16px_40px_rgba(26,26,26,0.14)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 motion-reduce:animate-none"
          data-testid="home-food-type-menu"
        >
          <Menu.RadioGroup value={value} onValueChange={(next) => onChange(next as HomeFoodPreference)}>
            {OPTIONS.map((option) => (
              <Menu.RadioItem
                key={option.value}
                value={option.value}
                className={cn(
                  "flex min-h-11 cursor-pointer select-none items-center gap-2.5 rounded-xl px-3 text-[0.9375rem] font-semibold outline-none data-[highlighted]:bg-[#F6F7F8]",
                  option.value === value && (option.value === "all" ? "bg-[#F6F7F8]" : TONES[option.value].row),
                )}
              >
                {option.value === "all" ? <Utensils className="h-4 w-4 text-[#D92714]" aria-hidden="true" /> : <FoodTypeMark type={option.value} />}
                <span className="flex-1">{option.label}</span>
                <Menu.ItemIndicator>
                  <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
                </Menu.ItemIndicator>
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
