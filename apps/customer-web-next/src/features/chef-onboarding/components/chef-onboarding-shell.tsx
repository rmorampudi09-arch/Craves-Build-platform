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
import { Spinner } from "@/features/chef-onboarding/components/chef-onboarding-ui";
import "@/features/chef-onboarding/styles/chef-onboarding.css";

export type ChefSaveState = "saved" | "saving" | "unsaved" | null;

type Props = {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Shown only when a save is confirmed by the backend, in progress or pending. */
  saveState: ChefSaveState;
  busy: boolean;
  /** null hides the Back button (for example on the submitted confirmation). */
  onBack: (() => void) | null;
  backLabel?: string;
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
  backLabel = "Back",
  exitLabel = "Save & exit",
  onExit,
  screenKey,
  hero,
}: Props) {
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
          {onBack || exitLabel || saveState ? (
            <header className="cob-header" data-scrolled={scrolled}>
              {onBack ? (
                <button
                  type="button"
                  className="cob-icon-button"
                  aria-label={backLabel}
                  disabled={busy}
                  onClick={onBack}
                >
                  <ArrowLeft size={20} aria-hidden="true" />
                </button>
              ) : null}
              <span className="cob-header-title" aria-hidden="true">
                {title}
              </span>
              <div className="cob-header-actions">
                {saveState ? (
                  <span role="status" aria-live="polite" className="cob-save-state">
                    {saveState === "saving" ? (
                      <Spinner red />
                    ) : saveState === "saved" ? (
                      <CheckCircle2 size={16} aria-hidden="true" />
                    ) : null}
                    <span>
                      {saveState === "saving"
                        ? "Saving"
                        : saveState === "saved"
                          ? "Draft saved"
                          : "Unsaved changes"}
                    </span>
                  </span>
                ) : null}
                {exitLabel ? (
                  <button
                    type="button"
                    className="cob-header-link"
                    disabled={busy}
                    onClick={onExit}
                  >
                    {exitLabel}
                  </button>
                ) : null}
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
