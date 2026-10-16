"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTitle,
  DialogDescription,
} from "@/shared/ui/overlays/dialog";
import { Content } from "@radix-ui/react-dialog";
import { messages } from "@/shared/i18n/language";
import { useLanguage, useText } from "@/shared/i18n/language-context";
import { LanguageButton } from "@/shared/ui/language/language-chooser";
import { Spinner } from "@/features/chef-onboarding/components/chef-onboarding-ui";
import "@/features/chef-onboarding/styles/chef-onboarding.css";

const TEXT = messages({
  en: { back: "Back", saveExit: "Save & exit", saving: "Saving", saved: "Draft saved", unsaved: "Unsaved changes" },
  te: { back: "వెనక్కి", saveExit: "సేవ్ చేసి వెళ్లండి", saving: "సేవ్ అవుతోంది", saved: "డ్రాఫ్ట్ సేవ్ అయింది", unsaved: "సేవ్ చేయని మార్పులు" },
  kn: { back: "ಹಿಂದೆ", saveExit: "ಉಳಿಸಿ ಹೊರಡಿ", saving: "ಉಳಿಸಲಾಗುತ್ತಿದೆ", saved: "ಡ್ರಾಫ್ಟ್ ಉಳಿಸಲಾಗಿದೆ", unsaved: "ಉಳಿಸದ ಬದಲಾವಣೆಗಳು" },
});

// `.cob button` resets every button, so the pill look is restated. On phones only the globe shows; its
// label still says the language.
const LANGUAGE_BUTTON =
  "shrink-0 !rounded-full !border !text-[0.9375rem] !font-semibold max-sm:!min-w-11 max-sm:!px-0 max-sm:justify-center max-sm:[&>:not(:first-child)]:hidden";

export type ChefSaveState = "saved" | "saving" | "unsaved" | null;

type Props = {
  title: string;
  description: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Shown only when a save is confirmed by the backend, in progress or pending. */
  saveState: ChefSaveState;
  busy: boolean;
  /** null hides the Back button (for example on the submitted confirmation). */
  onBack: (() => void) | null;
  backLabel?: string;
  /** Defaults to "Save & exit" in the chef's language; null hides it. */
  exitLabel?: string | null;
  onExit: () => void;
  /** A screen key: changing it resets scroll and moves focus to the new heading. */
  screenKey: string;
  hero?: ReactNode;
};

/**
 * Chef onboarding popup built on the same Radix dialog primitives as the existing Craves popups:
 * centred modal on desktop, full-height sheet on mobile, locked background, focus trap,
 * a sticky footer and no stepper.
 */
export function ChefOnboardingShell({
  title,
  description,
  children,
  footer,
  saveState,
  busy,
  onBack,
  backLabel,
  exitLabel,
  onExit,
  screenKey,
  hero,
}: Props) {
  const text = useText(TEXT);
  // Before a language is chosen the screen itself is the three choices.
  const { chosen } = useLanguage();
  const exit = exitLabel === undefined ? text.saveExit : exitLabel;
  const scroller = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const firstScreen = useRef(true);

  useEffect(() => {
    scroller.current?.scrollTo?.({ top: 0 });
    setScrolled(false);
    if (firstScreen.current) {
      firstScreen.current = false;
      return;
    }
    heading.current?.focus({ preventScroll: true });
  }, [screenKey]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onExit();
      }}
    >
      <DialogPortal>
        <DialogOverlay className="cob-backdrop" />
        <Content
          className="cob cob-modal"
          onOpenAutoFocus={(event) => {
            // Announce the screen title first instead of landing on the Back button.
            event.preventDefault();
            heading.current?.focus({ preventScroll: true });
          }}
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            if (!busy) onExit();
          }}
          aria-busy={busy}
        >
          {onBack || exit || saveState || chosen ? (
            <header className="cob-header" data-scrolled={scrolled}>
              {onBack ? (
                <button
                  type="button"
                  className="cob-icon-button"
                  aria-label={backLabel ?? text.back}
                  disabled={busy}
                  onClick={onBack}
                >
                  <ArrowLeft size={20} aria-hidden="true" />
                </button>
              ) : null}
              {/* Basis 0: the hidden title gives way first; then a long save note shortens, never the buttons. */}
              <span className="cob-header-title !basis-0" aria-hidden="true">
                {title}
              </span>
              <div className="cob-header-actions min-w-0 !shrink">
                {saveState ? (
                  <span role="status" aria-live="polite" className="cob-save-state min-w-0">
                    {saveState === "saving" ? (
                      <Spinner red />
                    ) : saveState === "saved" ? (
                      <CheckCircle2 size={16} aria-hidden="true" />
                    ) : null}
                    <span className="min-w-0 truncate">
                      {saveState === "saving"
                        ? text.saving
                        : saveState === "saved"
                          ? text.saved
                          : text.unsaved}
                    </span>
                  </span>
                ) : null}
                {exit ? (
                  <button
                    type="button"
                    className="cob-header-link shrink-0"
                    disabled={busy}
                    onClick={onExit}
                  >
                    {exit}
                  </button>
                ) : null}
                {/* The chef can switch language at any step. */}
                {chosen ? <LanguageButton className={LANGUAGE_BUTTON} /> : null}
              </div>
            </header>
          ) : null}
          <div
            ref={scroller}
            className="cob-scroll"
            onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 56)}
          >
            <div className="cob-body" key={screenKey}>
              {hero ?? null}
              <div className={`cob-heading ${hero ? "cob-heading--center" : ""}`}>
                <DialogTitle asChild>
                  <h1 ref={heading} tabIndex={-1}>
                    {title}
                  </h1>
                </DialogTitle>
                <DialogDescription>{description}</DialogDescription>
              </div>
              {children}
            </div>
          </div>
          {/* Keyed per screen so a click can never activate the next screen's submit button. */}
          {footer ? (
            <footer className="cob-footer" key={screenKey}>
              {footer}
            </footer>
          ) : null}
        </Content>
      </DialogPortal>
    </Dialog>
  );
}
