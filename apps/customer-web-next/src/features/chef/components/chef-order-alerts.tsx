"use client";

import { useState, useSyncExternalStore } from "react";
import { BellRing, Megaphone, Volume2 } from "lucide-react";
import { AppleSwitch } from "@/shared/ui/AppleSwitch";
import {
  canSpeak,
  ringForNewOrder,
  speakSample,
  unlockOrderSound,
  useAlertPrefs,
  writeAlertPrefs,
} from "@/features/chef/lib/chef-order-alert";
import { messages } from "@/shared/i18n/language";
import { useText } from "@/shared/i18n/language-context";

const noSubscribe = () => () => {};

const TEXT = messages({
  en: {
    title: "When a new order comes", ring: "Ring and vibrate", ringNote: "The phone rings while Craves is open.",
    speak: "Read the order aloud", speakNote: "The phone says what to cook.", test: "Test the sound",
    silent: "No sound came out. Turn the volume up and try again.", rang: "Keep Craves open and the volume up while you cook.",
    idle: "Keep Craves open on this phone while your kitchen is open.",
  },
  te: {
    title: "కొత్త ఆర్డర్ వచ్చినప్పుడు", ring: "రింగ్, వైబ్రేషన్", ringNote: "Craves తెరిచి ఉన్నప్పుడు ఫోన్ మోగుతుంది.",
    speak: "ఆర్డర్ గట్టిగా చదివి చెప్పడం", speakNote: "ఏమి వండాలో ఫోన్ చెబుతుంది.", test: "శబ్దం పరీక్షించండి",
    silent: "శబ్దం రాలేదు. వాల్యూమ్ పెంచి మళ్లీ ప్రయత్నించండి.", rang: "వంట చేస్తున్నప్పుడు Craves తెరిచి ఉంచండి, వాల్యూమ్ ఎక్కువగా ఉంచండి.",
    idle: "మీ వంటగది తెరిచి ఉన్నప్పుడు ఈ ఫోన్‌లో Craves తెరిచి ఉంచండి.",
  },
  kn: {
    title: "ಹೊಸ ಆರ್ಡರ್ ಬಂದಾಗ", ring: "ರಿಂಗ್ ಮತ್ತು ವೈಬ್ರೇಷನ್", ringNote: "Craves ತೆರೆದಿರುವಾಗ ಫೋನ್ ರಿಂಗ್ ಆಗುತ್ತದೆ.",
    speak: "ಆರ್ಡರ್ ಜೋರಾಗಿ ಓದಿ ಹೇಳುವುದು", speakNote: "ಏನು ಅಡುಗೆ ಮಾಡಬೇಕು ಎಂದು ಫೋನ್ ಹೇಳುತ್ತದೆ.", test: "ಶಬ್ದ ಪರೀಕ್ಷಿಸಿ",
    silent: "ಶಬ್ದ ಬರಲಿಲ್ಲ. ವಾಲ್ಯೂಮ್ ಹೆಚ್ಚಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.", rang: "ಅಡುಗೆ ಮಾಡುವಾಗ Craves ತೆರೆದಿಡಿ, ವಾಲ್ಯೂಮ್ ಹೆಚ್ಚಾಗಿ ಇಡಿ.",
    idle: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ ತೆರೆದಿರುವಾಗ ಈ ಫೋನ್‌ನಲ್ಲಿ Craves ತೆರೆದಿಡಿ.",
  },
});

/** How the phone tells a busy chef that an order is waiting: a ring, a buzz and, if wanted, a voice. */
export function ChefOrderAlerts() {
  const text = useText(TEXT);
  const prefs = useAlertPrefs();
  const speakable = useSyncExternalStore(noSubscribe, canSpeak, () => false);
  const [tested, setTested] = useState<"" | "rang" | "silent">("");

  function test() {
    unlockOrderSound();
    // The tap itself unlocks sound; give the phone a moment to wake its speaker.
    window.setTimeout(() => {
      setTested(ringForNewOrder() ? "rang" : "silent");
      // The same voice and language a real order would use.
      if (prefs.speak && speakable) window.setTimeout(speakSample, 1200);
    }, 80);
  }

  return (
    <section className="chef-section" aria-labelledby="chef-alerts-title">
      <div className="chef-section-head">
        <h2 id="chef-alerts-title" className="chef-section-title">{text.title}</h2>
      </div>
      <div className="chef-section-body grid gap-1">
        <div className="chef-setting-row">
          <span className="chef-row-icon"><BellRing className="h-5 w-5" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <p id="chef-alert-ring" className="chef-setting-title">{text.ring}</p>
            <p className="chef-section-note">{text.ringNote}</p>
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
              <p id="chef-alert-speak" className="chef-setting-title">{text.speak}</p>
              <p className="chef-section-note">{text.speakNote}</p>
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
            {text.test}
          </button>
          <p role="status" className="chef-section-note !text-[0.875rem]">
            {tested === "silent" ? text.silent : tested === "rang" ? text.rang : text.idle}
          </p>
        </div>
      </div>
    </section>
  );
}
