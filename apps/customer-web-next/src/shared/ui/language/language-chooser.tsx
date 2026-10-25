"use client";

import { useState } from "react";
import { Check, ChevronDown, Globe } from "lucide-react";
import { LANGUAGE_NAMES, type Language, messages } from "@/shared/i18n/language";
import { useLanguage, useText } from "@/shared/i18n/language-context";
import { Sheet } from "@/shared/ui/overlays/overlay";

// Telugu and Kannada first: most chefs read them more easily than English.
const ORDER: readonly Language[] = ["te", "kn", "en"];
// The first letter of each script: recognised at a glance, even by someone who reads slowly.
const LETTER: Record<Language, string> = { te: "అ", kn: "ಅ", en: "A" };

const TEXT = messages({
  en: { choose: "Choose your language", change: "Change language", hint: "You can change it any time in More." },
  te: { choose: "మీ భాషను ఎంచుకోండి", change: "భాష మార్చండి", hint: "దీన్ని ఎప్పుడైనా 'మరిన్ని'లో మార్చవచ్చు." },
  kn: { choose: "ನಿಮ್ಮ ಭಾಷೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ", change: "ಭಾಷೆ ಬದಲಿಸಿ", hint: "ಇದನ್ನು ಯಾವಾಗ ಬೇಕಾದರೂ 'ಇನ್ನಷ್ಟು'ದಲ್ಲಿ ಬದಲಿಸಬಹುದು." },
});

/** Three big choices: the letter of the script, the name in its own script, and the English name. */
export function LanguageOptions({ onChosen }: { onChosen?: (language: Language) => void }) {
  const { language: current, chosen, setLanguage } = useLanguage();
  return (
    <ul role="list" className="grid gap-3">
      {ORDER.map((code) => {
        const selected = chosen && code === current;
        const name = LANGUAGE_NAMES[code];
        return (
          <li key={code}>
            <button
              type="button"
              lang={code}
              aria-pressed={selected}
              onClick={() => {
                setLanguage(code);
                onChosen?.(code);
              }}
              className={`flex min-h-[4.5rem] w-full items-center gap-4 rounded-2xl border !bg-white px-4 py-3 text-left !shadow-none transition-[border-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A] focus-visible:ring-offset-2 ${
                selected ? "!border-[#1A1A1A] ring-1 ring-[#1A1A1A]" : "!border-[#D3D7DD] hover:!border-[#8A8F98]"
              }`}
            >
              <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-[#F1F3F5] text-[1.625rem] font-bold leading-none text-[#1A1A1A]">
                {LETTER[code]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[1.25rem] font-bold leading-snug text-[#1A1A1A]">{name.native}</span>
                {code === "en" ? null : <span lang="en" className="block text-[0.875rem] font-medium text-[#6B6B6B]">{name.english}</span>}
              </span>
              <span
                aria-hidden="true"
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 ${selected ? "border-[#1A1A1A] bg-[#1A1A1A] text-white" : "border-[#D3D7DD] text-transparent"}`}
              >
                <Check className="h-4 w-4" strokeWidth={3} />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The first thing a new chef sees on sign-in and on the application: the question in all three
 * languages, because we don't know yet which one they read.
 */
export function LanguageWelcome({ onChosen }: { onChosen?: (language: Language) => void }) {
  return (
    <section aria-labelledby="craves-language-title" className="w-full rounded-3xl border border-[#E5E7EB] bg-white p-5 text-[#1A1A1A] sm:p-8">
      <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-2xl bg-[#F1F3F5]">
        <Globe className="h-6 w-6" />
      </span>
      <h1 id="craves-language-title" className="mt-4 text-[1.625rem] font-bold leading-tight tracking-tight">
        {TEXT.en.choose}
      </h1>
      <p className="mt-2 grid gap-0.5 text-[1rem] font-semibold leading-relaxed text-[#6B6B6B]">
        <span lang="te">{TEXT.te.choose}</span>
        <span lang="kn">{TEXT.kn.choose}</span>
      </p>
      <div className="mt-6">
        <LanguageOptions onChosen={onChosen} />
      </div>
    </section>
  );
}

/** A small button that shows the current language and opens the three choices. */
export function LanguageButton({ className = "" }: { className?: string }) {
  const { language } = useLanguage();
  const text = useText(TEXT);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${text.change}: ${LANGUAGE_NAMES[language].native}`}
        onClick={() => setOpen(true)}
        className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border !border-[#D3D7DD] !bg-white px-3 text-[0.9375rem] font-semibold !text-[#1A1A1A] !shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A] ${className}`}
      >
        <Globe className="h-4 w-4" aria-hidden="true" />
        <span lang={language}>{LANGUAGE_NAMES[language].native}</span>
        <ChevronDown className="h-4 w-4 text-[#6B6B6B]" aria-hidden="true" />
      </button>
      <LanguageSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

/** The three choices in a sheet; closes as soon as one is picked. */
export function LanguageSheet({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const text = useText(TEXT);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={text.change} description={text.hint}>
      <div className="mt-4">
        <LanguageOptions onChosen={() => onOpenChange(false)} />
      </div>
    </Sheet>
  );
}
