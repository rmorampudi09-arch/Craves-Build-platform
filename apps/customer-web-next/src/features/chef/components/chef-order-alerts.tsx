"use client";

import { useState, useSyncExternalStore } from "react";
import { BellRing, Megaphone, Volume2 } from "lucide-react";
import { AppleSwitch } from "@/shared/ui/AppleSwitch";
import {
  canSpeak,
  ringForNewOrder,
  unlockOrderSound,
  useAlertPrefs,
  writeAlertPrefs,
} from "@/features/chef/lib/chef-order-alert";

const noSubscribe = () => () => {};

function speakSample() {
  const utterance = new SpeechSynthesisUtterance("New order. 2 Chicken Biryani. 1 Rasmalai.");
  utterance.lang = "en-IN";
  utterance.rate = 0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

/** How the phone tells a busy chef that an order is waiting: a ring, a buzz and, if wanted, a voice. */
export function ChefOrderAlerts() {
  const prefs = useAlertPrefs();
  const speakable = useSyncExternalStore(noSubscribe, canSpeak, () => false);
  const [tested, setTested] = useState<"" | "rang" | "silent">("");

  function test() {
    unlockOrderSound();
    // The tap itself unlocks sound; give the phone a moment to wake its speaker.
    window.setTimeout(() => {
      setTested(ringForNewOrder() ? "rang" : "silent");
      if (prefs.speak && speakable) window.setTimeout(speakSample, 1200);
    }, 80);
  }

  return (
    <section className="chef-section" aria-labelledby="chef-alerts-title">
      <div className="chef-section-head">
        <h2 id="chef-alerts-title" className="chef-section-title">When a new order comes</h2>
      </div>
      <div className="chef-section-body grid gap-1">
        <div className="chef-setting-row">
          <span className="chef-row-icon"><BellRing className="h-5 w-5" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <p id="chef-alert-ring" className="chef-setting-title">Ring and vibrate</p>
            <p className="chef-section-note">The phone rings while Craves is open.</p>
          </div>
          <AppleSwitch
            checked={prefs.ring}
            onCheckedChange={(ring) => writeAlertPrefs({ ...prefs, ring })}
            size="md"
            tone="go"
            aria-labelledby="chef-alert-ring"
          />
        </div>
        {speakable ? (
          <div className="chef-setting-row">
            <span className="chef-row-icon"><Megaphone className="h-5 w-5" aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <p id="chef-alert-speak" className="chef-setting-title">Read the order aloud</p>
              <p className="chef-section-note">The phone says what to cook.</p>
            </div>
            <AppleSwitch
              checked={prefs.speak}
              onCheckedChange={(speak) => writeAlertPrefs({ ...prefs, speak })}
              size="md"
              tone="go"
              aria-labelledby="chef-alert-speak"
            />
          </div>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <button type="button" onClick={test} className="chef-btn is-small">
            <Volume2 className="h-4 w-4" aria-hidden="true" />
            Test the sound
          </button>
          <p role="status" className="chef-section-note !text-[0.875rem]">
            {tested === "silent"
              ? "No sound came out. Turn the volume up and try again."
              : tested === "rang"
                ? "Keep Craves open and the volume up while you cook."
                : "Keep Craves open on this phone while your kitchen is open."}
          </p>
        </div>
      </div>
    </section>
  );
}
