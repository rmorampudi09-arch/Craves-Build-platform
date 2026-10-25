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
import { format, messages } from "@/shared/i18n/language";
import { useText } from "@/shared/i18n/language-context";

const TEXT = messages({
  en: {
    pictures: "Pictures", picture: "Picture {number}", opening: "Opening Chef Mode", title: "Choose your profile picture",
    subtitle: "Customers see this picture with your name on your kitchen page. You can change it any time.",
    failed: "We couldn’t save your picture. Please try again.", saving: "Saving…", tryAgain: "Try again", continue: "Continue", notNow: "Not now",
  },
  te: {
    pictures: "చిత్రాలు", picture: "చిత్రం {number}", opening: "చెఫ్ మోడ్ తెరుస్తున్నాం", title: "మీ ప్రొఫైల్ చిత్రం ఎంచుకోండి",
    subtitle: "మీ వంటగది పేజీలో మీ పేరుతో పాటు కస్టమర్లకు ఈ చిత్రం కనిపిస్తుంది. ఎప్పుడైనా మార్చుకోవచ్చు.",
    failed: "మీ చిత్రం సేవ్ చేయలేకపోయాం. దయచేసి మళ్లీ ప్రయత్నించండి.", saving: "సేవ్ అవుతోంది…", tryAgain: "మళ్లీ ప్రయత్నించండి", continue: "కొనసాగండి", notNow: "ఇప్పుడు వద్దు",
  },
  kn: {
    pictures: "ಚಿತ್ರಗಳು", picture: "ಚಿತ್ರ {number}", opening: "ಚೆಫ್ ಮೋಡ್ ತೆರೆಯುತ್ತಿದ್ದೇವೆ", title: "ನಿಮ್ಮ ಪ್ರೊಫೈಲ್ ಚಿತ್ರ ಆಯ್ಕೆಮಾಡಿ",
    subtitle: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ ಪುಟದಲ್ಲಿ ನಿಮ್ಮ ಹೆಸರಿನೊಂದಿಗೆ ಗ್ರಾಹಕರಿಗೆ ಈ ಚಿತ್ರ ಕಾಣುತ್ತದೆ. ಯಾವಾಗ ಬೇಕಾದರೂ ಬದಲಾಯಿಸಬಹುದು.",
    failed: "ನಿಮ್ಮ ಚಿತ್ರ ಉಳಿಸಲು ಆಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.", saving: "ಉಳಿಸಲಾಗುತ್ತಿದೆ…", tryAgain: "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ", continue: "ಮುಂದುವರಿಸಿ", notNow: "ಈಗ ಬೇಡ",
  },
});

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
  const text = useText(TEXT);
  const name = useId();
  return (
    <div role="radiogroup" aria-label={text.pictures} className="grid grid-cols-3 gap-3 sm:grid-cols-4">
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
            aria-label={format(text.picture, { number: index + 1 })}
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
  const text = useText(TEXT);
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
    return <ChefLoading shape={shape} label={text.opening} head={shape !== "chat"} />;
  return (
    <section className="chef-section p-5 md:p-7" aria-labelledby="chef-avatar-title">
      <h1 id="chef-avatar-title" className="chef-page-title">
        {text.title}
      </h1>
      <p className="chef-page-subtitle">{text.subtitle}</p>
      <div className="mt-6">
        <ChefAvatarGrid selectedId={selected} onSelect={setSelected} disabled={saving} />
      </div>
      {failed ? (
        <p role="alert" className="chef-field-error mt-5 text-center">
          {text.failed}
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
          {saving ? text.saving : failed ? text.tryAgain : text.continue}
        </button>
        {failed ? (
          <button type="button" className="chef-btn is-block" disabled={saving} onClick={open}>
            {text.notNow}
          </button>
        ) : null}
      </div>
    </section>
  );
}
