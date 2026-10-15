"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Check } from "lucide-react";
import { getSession } from "@/features/auth/api/cravesAuth";
import { readChefKitchen, saveChefAvatar } from "@/features/chef/api/chef-kitchen";
import { ChefLoading, chefLoadingShapeFor } from "@/features/chef/components/chef-loading";
import {
  CHEF_AVATAR_IDS,
  chefAvatarGateStep,
  chefAvatarUrl,
} from "@/features/chef/lib/chef-kitchen-contract";
import { ChefFace } from "@/shared/ui/data-display/ChefFace";

/** The 18 drawn faces as radio buttons (arrow keys move between them); the picked one gets a red ring and a tick. */
export function ChefAvatarGrid({
  selectedId,
  onSelect,
  disabled = false,
}: {
  selectedId: string | null;
  onSelect(id: string): void;
  disabled?: boolean;
}) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label="Pictures" className="grid grid-cols-3 gap-3 sm:grid-cols-4">
      {CHEF_AVATAR_IDS.map((id, index) => (
        <label
          key={id}
          className="relative cursor-pointer rounded-full border-[3px] border-transparent p-0.5 has-checked:border-[#F62E18] has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-[#1A1A1A] has-disabled:cursor-not-allowed has-disabled:opacity-50"
        >
          <input
            type="radio"
            name={name}
            value={id}
            checked={selectedId === id}
            disabled={disabled}
            onChange={() => onSelect(id)}
            aria-label={`Picture ${index + 1}`}
            className="sr-only"
          />
          <ChefFace photoUrl={chefAvatarUrl(id)} className="!h-auto !w-full aspect-square" />
          {selectedId === id ? (
            <span
              className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border-2 border-white bg-[#F62E18] text-white"
              aria-hidden="true"
            >
              <Check className="h-4 w-4" />
            </span>
          ) : null}
        </label>
      ))}
    </div>
  );
}

// Chefs already let in during this page load: later chef pages open at once.
const letIn = new Set<string>();

/**
 * Holds the chef area back until the chef has picked a picture. It never traps a chef: see
 * chefAvatarGateStep, and "Not now" after a failed save lets them in until the next page load.
 */
export function ChefAvatarGate({ children }: { children: ReactNode }) {
  const chefId = getSession()?.id ?? "";
  const shape = chefLoadingShapeFor(usePathname());
  const [step, setStep] = useState<"wait" | "ask" | "open">(() =>
    letIn.has(chefId) ? "open" : "wait",
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (step !== "wait") return;
    let active = true;
    void readChefKitchen()
      .then(
        (kitchen) => kitchen,
        () => "failed" as const,
      )
      .then((read) => {
        if (!active) return;
        const next = chefAvatarGateStep(read);
        if (next === "open") letIn.add(chefId);
        setStep(next);
      });
    return () => {
      active = false;
    };
  }, [step, chefId]);

  function open() {
    letIn.add(chefId);
    setStep("open");
  }

  async function save() {
    if (!selected || saving) return;
    setSaving(true);
    try {
      await saveChefAvatar(selected);
      open();
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  if (step === "open") return <>{children}</>;
  if (step === "wait")
    return <ChefLoading shape={shape} label="Opening Chef Mode" head={shape !== "chat"} />;
  return (
    <section className="chef-section p-5 md:p-7" aria-labelledby="chef-avatar-title">
      <h1 id="chef-avatar-title" className="chef-page-title">
        Choose your profile picture
      </h1>
      <p className="chef-page-subtitle">
        Customers see this picture with your name on your kitchen page. You can change it any time.
      </p>
      <div className="mt-6">
        <ChefAvatarGrid selectedId={selected} onSelect={setSelected} disabled={saving} />
      </div>
      {failed ? (
        <p role="alert" className="chef-field-error mt-5 text-center">
          We couldn’t save your picture. Please try again.
        </p>
      ) : null}
      <div className="mt-6 grid gap-2">
        <button
          type="button"
          className="chef-btn is-primary is-block"
          disabled={!selected || saving}
          aria-busy={saving}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : failed ? "Try again" : "Continue"}
        </button>
        {failed ? (
          <button type="button" className="chef-btn is-block" disabled={saving} onClick={open}>
            Not now
          </button>
        ) : null}
      </div>
    </section>
  );
}
