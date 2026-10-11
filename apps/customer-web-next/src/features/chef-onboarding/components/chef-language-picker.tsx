"use client";

import { useId, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, Languages } from "lucide-react";
import { Sheet } from "@/shared/ui/overlays/overlay";
import { ONBOARDING_LANGUAGES } from "@/features/chef-onboarding/lib/chef-onboarding-v2-contract";

// "हिन्दी · Hindi": each language in its own script, with its English name for anyone helping.
// A fixed list: browsers' own names miss some (Chromium has none for Bodo, Kashmiri or Santali).
const ENGLISH_NAMES: Record<string, string> = {
  as: "Assamese", bn: "Bengali", brx: "Bodo", doi: "Dogri", gu: "Gujarati", hi: "Hindi", kn: "Kannada",
  ks: "Kashmiri", kok: "Konkani", mai: "Maithili", ml: "Malayalam", mni: "Manipuri", mr: "Marathi",
  ne: "Nepali", or: "Odia", pa: "Punjabi", sa: "Sanskrit", sat: "Santali", sd: "Sindhi", ta: "Tamil",
  te: "Telugu", ur: "Urdu",
};
function englishName(code: string): string {
  return ENGLISH_NAMES[code] ?? "";
}

/** The language of the FSSAI video guide: a field that opens a sheet of every language. */
export function LanguagePicker({
  labelId,
  value,
  disabled,
  onChange,
}: {
  labelId: string;
  value: string;
  disabled?: boolean;
  onChange: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const valueId = useId();
  const current = ONBOARDING_LANGUAGES.find(([code]) => code === value) ?? ONBOARDING_LANGUAGES[0];
  const currentEnglish = current[0] === "en" ? "" : englishName(current[0]);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        aria-labelledby={`${labelId} ${valueId}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="cob-input cob-date-trigger"
      >
        <span id={valueId} className="cob-language-value">
          <Languages size={18} aria-hidden="true" />
          <span lang={current[0]}>{current[1]}</span>
          {currentEnglish ? <span className="cob-language-english">{currentEnglish}</span> : null}
        </span>
        <ChevronDown size={20} aria-hidden="true" />
      </button>

      <Sheet open={open} onOpenChange={setOpen} title="Video language" description="Choose the language you are most comfortable in.">
        <ul role="list" className="mt-3 grid max-h-[60vh] gap-1 overflow-y-auto overscroll-contain pr-1">
          {ONBOARDING_LANGUAGES.map(([code, label], index) => {
            const selected = code === current[0];
            const name = code === "en" ? "" : englishName(code);
            return (
              <motion.li
                key={code}
                initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1], delay: reduceMotion ? 0 : Math.min(index, 12) * 0.02 }}
              >
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    onChange(code);
                    setOpen(false);
                  }}
                  className={`flex min-h-14 w-full items-center gap-3 rounded-2xl !border-0 px-4 text-left !shadow-none transition-[background-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A] ${
                    selected ? "!bg-[#1A1A1A] !text-white" : "!bg-transparent !text-[#1A1A1A] hover:!bg-[#F1F3F5]"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span lang={code} className="block text-[1.0625rem] font-semibold leading-snug">
                      {label}
                    </span>
                    {name ? (
                      <span className={`block text-sm leading-snug ${selected ? "text-white/75" : "text-[#6B6B6B]"}`}>{name}</span>
                    ) : null}
                  </span>
                  {selected ? <Check size={20} aria-hidden="true" strokeWidth={2.5} /> : null}
                </button>
              </motion.li>
            );
          })}
        </ul>
      </Sheet>
    </>
  );
}
