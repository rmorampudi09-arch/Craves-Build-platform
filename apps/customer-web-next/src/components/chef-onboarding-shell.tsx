"use client";

import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/overlays/dialog";
import { Content } from "@radix-ui/react-dialog";
import "@/styles/chef-onboarding.css";

type Props = {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
  saved: boolean;
  busy: boolean;
  canSave: boolean;
  onBack: () => void;
  onExit: () => void;
};
/** Uses the same accessible dialog primitives as the existing Craves popups. */
export function ChefOnboardingShell({
  title,
  description,
  children,
  footer,
  saved,
  busy,
  canSave,
  onBack,
  onExit,
}: Props) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onExit();
      }}
    >
      <DialogPortal>
        <DialogOverlay className="chef-onboarding-backdrop" />
        <Content
          className="chef-onboarding-modal"
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            if (!busy) onExit();
          }}
          aria-busy={busy}
        >
          <header className="chef-onboarding-header">
            <button
              type="button"
              className="chef-onboarding-text-action"
              disabled={busy}
              onClick={onBack}
            >
              <ArrowLeft size={18} aria-hidden="true" />
              Back
            </button>
            <div className="chef-onboarding-header-actions">
              {canSave ? (
                <span role="status" className="chef-onboarding-save-state">
                  {busy ? "Saving" : saved ? "Draft saved" : "Unsaved changes"}
                </span>
              ) : null}
              <button
                type="button"
                className="chef-onboarding-text-action"
                disabled={busy}
                onClick={onExit}
              >
                {canSave ? "Save and exit" : "Close"}
              </button>
            </div>
          </header>
          <div className="chef-onboarding-scroll" key={title}>
            <div className="chef-onboarding-heading">
              <DialogTitle asChild>
                <h1>{title}</h1>
              </DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </div>
            {children}
          </div>
          {footer ? <footer className="chef-onboarding-footer">{footer}</footer> : null}
        </Content>
      </DialogPortal>
    </Dialog>
  );
}
