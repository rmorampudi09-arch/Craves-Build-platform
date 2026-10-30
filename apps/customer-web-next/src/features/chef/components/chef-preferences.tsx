"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { AppleSwitch } from "@/shared/ui/AppleSwitch";
import { Dialog, secondaryActionClass } from "@/shared/ui/overlays/overlay";
import { sessionFetch } from "@/shared/lib/session-fetch";
import { isComingSoon } from "@/features/chef/api/chef-kitchen-schedule";
import { ChefSkeletonRow } from "@/features/chef/components/chef-loading";
import { ChefEmpty, ChefPill, ChefSection } from "@/features/chef/components/chef-ui";
import {
  CHEF_ERROR_MESSAGES,
  ChefError,
  chefApiError,
  chefErrorText,
} from "@/features/chef/lib/chef-errors";
import {
  parseChefKitchenSettings,
  type ChefKitchenSettings,
} from "@/features/chef/lib/chef-schedule-contract";
import { format, messages } from "@/shared/i18n/language";
import { useText } from "@/shared/i18n/language-context";

const COOKING_TIMES = [10, 15, 20, 25, 30, 40, 45, 60];

const TEXT = messages({
  en: {
    loadFailed: "We couldn’t load your order settings.", saveFailed: "We couldn’t save that. Please try again.", orders: "Orders",
    soonTitle: "Order settings are on their way", soonText: "Automatic acceptance and a default cooking time will be here soon.",
    failedTitle: "We couldn’t load your order settings", tryAgain: "Try again", saved: "Saved", saving: "Saving…",
    autoAccept: "Accept orders automatically", onlyOpen: "Only while your kitchen is open", cookingTime: "Default cooking time",
    minutes: "{minutes} min", notSet: "Not set", noTimeSet: "Used when a dish has no time set",
    confirmTitle: "Accept new orders automatically?", confirmText: "Orders are accepted with your cooking time while your kitchen is open.",
    notNow: "Not now", turnOn: "Turn on",
    notifications: "Notifications", email: "Email", emailNote: "Statements and updates", comingSoon: "Coming soon",
    emailFailed: "We couldn’t load your email setting.",
  },
  te: {
    loadFailed: "మీ ఆర్డర్ సెట్టింగ్స్ లోడ్ చేయలేకపోయాం.", saveFailed: "అది సేవ్ చేయలేకపోయాం. దయచేసి మళ్లీ ప్రయత్నించండి.", orders: "ఆర్డర్లు",
    soonTitle: "ఆర్డర్ సెట్టింగ్స్ త్వరలో వస్తాయి", soonText: "ఆర్డర్లు ఆటోమేటిక్‌గా ఒప్పుకోవడం, మామూలు వంట సమయం త్వరలో ఇక్కడ వస్తాయి.",
    failedTitle: "మీ ఆర్డర్ సెట్టింగ్స్ లోడ్ చేయలేకపోయాం", tryAgain: "మళ్లీ ప్రయత్నించండి", saved: "సేవ్ అయింది", saving: "సేవ్ అవుతోంది…",
    autoAccept: "ఆర్డర్లను ఆటోమేటిక్‌గా ఒప్పుకోవడం", onlyOpen: "మీ వంటగది తెరిచి ఉన్నప్పుడు మాత్రమే", cookingTime: "మామూలు వంట సమయం",
    minutes: "{minutes} నిమి", notSet: "పెట్టలేదు", noTimeSet: "వంటకానికి సమయం పెట్టకపోతే ఇది వాడతాం",
    confirmTitle: "కొత్త ఆర్డర్లను ఆటోమేటిక్‌గా ఒప్పుకోవాలా?", confirmText: "మీ వంటగది తెరిచి ఉన్నప్పుడు, మీ వంట సమయంతో ఆర్డర్లు ఒప్పుకుంటాం.",
    notNow: "ఇప్పుడు వద్దు", turnOn: "ఆన్ చేయండి",
    notifications: "నోటిఫికేషన్లు", email: "ఈమెయిల్", emailNote: "స్టేట్‌మెంట్‌లు, అప్‌డేట్‌లు", comingSoon: "త్వరలో వస్తుంది",
    emailFailed: "మీ ఈమెయిల్ సెట్టింగ్ లోడ్ చేయలేకపోయాం.",
  },
  kn: {
    loadFailed: "ನಿಮ್ಮ ಆರ್ಡರ್ ಸೆಟ್ಟಿಂಗ್‌ಗಳನ್ನು ಲೋಡ್ ಮಾಡಲು ಆಗಲಿಲ್ಲ.", saveFailed: "ಅದನ್ನು ಉಳಿಸಲು ಆಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.", orders: "ಆರ್ಡರ್‌ಗಳು",
    soonTitle: "ಆರ್ಡರ್ ಸೆಟ್ಟಿಂಗ್‌ಗಳು ಶೀಘ್ರದಲ್ಲೇ ಬರಲಿವೆ", soonText: "ಆರ್ಡರ್ ತಾನಾಗಿಯೇ ಒಪ್ಪಿಕೊಳ್ಳುವುದು ಮತ್ತು ಸಾಮಾನ್ಯ ಅಡುಗೆ ಸಮಯ ಶೀಘ್ರದಲ್ಲೇ ಇಲ್ಲಿ ಬರಲಿವೆ.",
    failedTitle: "ನಿಮ್ಮ ಆರ್ಡರ್ ಸೆಟ್ಟಿಂಗ್‌ಗಳನ್ನು ಲೋಡ್ ಮಾಡಲು ಆಗಲಿಲ್ಲ", tryAgain: "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ", saved: "ಉಳಿಸಲಾಗಿದೆ", saving: "ಉಳಿಸಲಾಗುತ್ತಿದೆ…",
    autoAccept: "ಆರ್ಡರ್‌ಗಳನ್ನು ತಾನಾಗಿಯೇ ಒಪ್ಪಿಕೊಳ್ಳುವುದು", onlyOpen: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ ತೆರೆದಿರುವಾಗ ಮಾತ್ರ", cookingTime: "ಸಾಮಾನ್ಯ ಅಡುಗೆ ಸಮಯ",
    minutes: "{minutes} ನಿಮಿ", notSet: "ಹಾಕಿಲ್ಲ", noTimeSet: "ಖಾದ್ಯಕ್ಕೆ ಸಮಯ ಹಾಕದಿದ್ದರೆ ಇದನ್ನು ಬಳಸುತ್ತೇವೆ",
    confirmTitle: "ಹೊಸ ಆರ್ಡರ್‌ಗಳನ್ನು ತಾನಾಗಿಯೇ ಒಪ್ಪಿಕೊಳ್ಳಬೇಕೇ?", confirmText: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ ತೆರೆದಿರುವಾಗ, ನಿಮ್ಮ ಅಡುಗೆ ಸಮಯದೊಂದಿಗೆ ಆರ್ಡರ್‌ಗಳನ್ನು ಒಪ್ಪಿಕೊಳ್ಳಲಾಗುತ್ತದೆ.",
    notNow: "ಈಗ ಬೇಡ", turnOn: "ಆನ್ ಮಾಡಿ",
    notifications: "ಅಧಿಸೂಚನೆಗಳು", email: "ಇಮೇಲ್", emailNote: "ಸ್ಟೇಟ್‌ಮೆಂಟ್‌ಗಳು ಮತ್ತು ಅಪ್‌ಡೇಟ್‌ಗಳು", comingSoon: "ಶೀಘ್ರದಲ್ಲೇ ಬರಲಿದೆ",
    emailFailed: "ನಿಮ್ಮ ಇಮೇಲ್ ಸೆಟ್ಟಿಂಗ್ ಲೋಡ್ ಮಾಡಲು ಆಗಲಿಲ್ಲ.",
  },
});

type Load =
  | { state: "loading" }
  | { state: "ready"; settings: ChefKitchenSettings }
  | { state: "soon" }
  | { state: "error"; message: string };

/** Reads the settings, or saves both of them when given (PUT replaces the pair). */
async function request(fallback: string, settings?: ChefKitchenSettings): Promise<ChefKitchenSettings> {
  const response = await sessionFetch(
    "/api/chef/kitchen/settings",
    settings
      ? {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(settings),
        }
      : { cache: "no-store" },
  );
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw chefApiError(response, body, fallback);
  const parsed = parseChefKitchenSettings(body);
  if (!parsed)
    throw new ChefError(
      CHEF_ERROR_MESSAGES.UNEXPECTED_RESPONSE,
      "INVALID_KITCHEN_SETTINGS_RESPONSE",
      response.status,
    );
  return parsed;
}

/** Order settings: accept orders automatically, and the cooking time used when a dish has none. */
export function ChefPreferences() {
  const text = useText(TEXT);
  // The read below runs once per attempt, not again when the chef changes language.
  const words = useRef(text);
  useEffect(() => {
    words.current = text;
  });
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [confirmAuto, setConfirmAuto] = useState(false);

  useEffect(() => {
    let active = true;
    const failed = words.current.loadFailed;
    request(failed).then(
      (settings) => active && setLoad({ state: "ready", settings }),
      (caught: unknown) =>
        active &&
        setLoad(
          isComingSoon(caught)
            ? { state: "soon" }
            : { state: "error", message: chefErrorText(caught, failed) },
        ),
    );
    return () => {
      active = false;
    };
  }, [attempt]);

  if (load.state === "loading") {
    return (
      <ChefSection title={text.orders} flush labelledBy="chef-order-settings">
        <div className="chef-list" aria-busy="true">
          <ChefSkeletonRow media="none" trailing="toggle" />
          <ChefSkeletonRow media="none" trailing="value" />
        </div>
      </ChefSection>
    );
  }
  if (load.state === "soon") {
    return (
      <ChefSection>
        <ChefEmpty illustration="comingSoon" title={text.soonTitle} text={text.soonText} />
      </ChefSection>
    );
  }
  if (load.state === "error") {
    return (
      <ChefSection>
        <ChefEmpty
          illustration="loadError"
          title={text.failedTitle}
          text={load.message}
          action={
            <button
              type="button"
              className="chef-btn is-primary"
              onClick={() => {
                setLoad({ state: "loading" });
                setAttempt((value) => value + 1);
              }}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {text.tryAgain}
            </button>
          }
        />
      </ChefSection>
    );
  }

  const { settings } = load;
  const minutes = settings.defaultPrepMinutes;
  const times = [...new Set(minutes ? [...COOKING_TIMES, minutes] : COOKING_TIMES)].sort(
    (a, b) => a - b,
  );

  /** One save at a time; a failed save changes nothing on screen and says so. */
  async function save(next: ChefKitchenSettings) {
    if (saving) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      setLoad({ state: "ready", settings: await request(text.saveFailed, next) });
      setSaved(true);
    } catch (caught) {
      setError(chefErrorText(caught, text.saveFailed));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ChefSection title={text.orders} labelledBy="chef-order-settings">
        <div className="chef-setting-row">
          <div className="min-w-0 flex-1">
            <p id="chef-auto-accept" className="chef-setting-title">
              {text.autoAccept}
            </p>
            <p id="chef-auto-accept-note" className="chef-section-note">
              {text.onlyOpen}
            </p>
          </div>
          <AppleSwitch
            checked={settings.autoAcceptOrders}
            aria-disabled={saving || undefined}
            onCheckedChange={(on) =>
              on ? setConfirmAuto(true) : void save({ ...settings, autoAcceptOrders: false })
            }
            size="md"
            tone="go"
            aria-labelledby="chef-auto-accept"
            aria-describedby="chef-auto-accept-note"
          />
        </div>
        <div className="chef-setting-row !block !py-3">
          <p id="chef-cooking-time" className="chef-setting-title">
            {text.cookingTime}{" "}
            <span className="font-normal text-[#6B6B6B]">
              · {minutes ? format(text.minutes, { minutes }) : text.notSet}
            </span>
          </p>
          <p className="chef-section-note">{text.noTimeSet}</p>
          <div role="group" aria-labelledby="chef-cooking-time" className="chef-chips is-wrap mt-3">
            {times.map((value) => (
              <button
                key={value}
                type="button"
                className="chef-chip"
                aria-pressed={value === minutes}
                disabled={saving}
                onClick={() =>
                  value !== minutes && void save({ ...settings, defaultPrepMinutes: value })
                }
              >
                {format(text.minutes, { minutes: value })}
              </button>
            ))}
          </div>
        </div>
        {error ? (
          <p role="alert" className="chef-field-error !text-[0.9375rem]">
            {error}
          </p>
        ) : null}
        <p role="status" className="sr-only">
          {saving ? text.saving : saved ? text.saved : ""}
        </p>
      </ChefSection>
      <Dialog
        open={confirmAuto}
        onOpenChange={setConfirmAuto}
        title={text.confirmTitle}
        description={text.confirmText}
        footer={
          <>
            <button
              type="button"
              className={secondaryActionClass}
              onClick={() => setConfirmAuto(false)}
            >
              {text.notNow}
            </button>
            <button
              type="button"
              className="craves-primary-action w-full sm:w-auto"
              onClick={() => {
                setConfirmAuto(false);
                void save({ ...settings, autoAcceptOrders: true });
              }}
            >
              {text.turnOn}
            </button>
          </>
        }
      />
    </>
  );
}

/** Reads the email switch, or saves it when given. */
async function emailRequest(fallback: string, enabled?: boolean): Promise<boolean> {
  const response = await sessionFetch(
    "/api/notifications/preferences/email",
    enabled === undefined
      ? { cache: "no-store" }
      : { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) },
  );
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw chefApiError(response, body, fallback);
  const saved = (body as { enabled?: unknown } | null)?.enabled;
  if (typeof saved !== "boolean")
    throw new ChefError(CHEF_ERROR_MESSAGES.UNEXPECTED_RESPONSE, "INVALID_NOTIFICATION_PREFERENCES_RESPONSE", response.status);
  return saved;
}

/** Email · Statements and updates (app Preferences → Notifications); Coming soon until the gateway routes it. */
export function ChefEmailPreference() {
  const text = useText(TEXT);
  const words = useRef(text);
  useEffect(() => {
    words.current = text;
  });
  const [email, setEmail] = useState<"loading" | "soon" | "error" | boolean>("loading");
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const failed = words.current.emailFailed;
    emailRequest(failed).then(
      (enabled) => active && setEmail(enabled),
      (caught: unknown) => {
        if (!active) return;
        setEmail(isComingSoon(caught) ? "soon" : "error");
        if (!isComingSoon(caught)) setError(chefErrorText(caught, failed));
      },
    );
    return () => {
      active = false;
    };
  }, [attempt]);

  /** One save at a time; a failed save leaves the switch as it was and says so. */
  async function save(enabled: boolean) {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      setEmail(await emailRequest(text.saveFailed, enabled));
    } catch (caught) {
      setError(chefErrorText(caught, text.saveFailed));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ChefSection title={text.notifications} labelledBy="chef-notification-settings">
      {email === "loading" ? (
        <div aria-busy="true">
          <ChefSkeletonRow media="none" trailing="toggle" />
        </div>
      ) : (
        <div className="chef-setting-row">
          <div className="min-w-0 flex-1">
            <p id="chef-email" className="chef-setting-title">
              {text.email}
            </p>
            <p id="chef-email-note" className="chef-section-note">
              {text.emailNote}
            </p>
          </div>
          {typeof email === "boolean" ? (
            <AppleSwitch
              checked={email}
              aria-disabled={saving || undefined}
              onCheckedChange={(on) => void save(on)}
              size="md"
              tone="go"
              aria-labelledby="chef-email"
              aria-describedby="chef-email-note"
            />
          ) : email === "soon" ? (
            <ChefPill>{text.comingSoon}</ChefPill>
          ) : (
            <button
              type="button"
              className="chef-btn"
              onClick={() => {
                setError("");
                setEmail("loading");
                setAttempt((value) => value + 1);
              }}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {text.tryAgain}
            </button>
          )}
        </div>
      )}
      {error ? (
        <p role="alert" className="chef-field-error !text-[0.9375rem]">
          {error}
        </p>
      ) : null}
    </ChefSection>
  );
}
