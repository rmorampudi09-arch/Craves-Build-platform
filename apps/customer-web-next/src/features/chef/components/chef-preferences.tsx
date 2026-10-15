"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { AppleSwitch } from "@/shared/ui/AppleSwitch";
import { ComingSoon } from "@/shared/ui/feedback/ComingSoon";
import { Dialog, secondaryActionClass } from "@/shared/ui/overlays/overlay";
import { sessionFetch } from "@/features/auth/api/sessionFetch";
import { isComingSoon } from "@/features/chef/api/chef-kitchen-schedule";
import { ChefSkeletonRow } from "@/features/chef/components/chef-loading";
import { ChefEmpty, ChefSection } from "@/features/chef/components/chef-ui";
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

const LOAD_FAILED = "We couldn’t load your order settings.";
const SAVE_FAILED = "We couldn’t save that. Please try again.";
const COOKING_TIMES = [10, 15, 20, 25, 30, 40, 45, 60];

type Load =
  | { state: "loading" }
  | { state: "ready"; settings: ChefKitchenSettings }
  | { state: "soon" }
  | { state: "error"; message: string };

/** Reads the settings, or saves both of them when given (PUT replaces the pair). */
async function request(settings?: ChefKitchenSettings): Promise<ChefKitchenSettings> {
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
  if (!response.ok) throw chefApiError(response, body, settings ? SAVE_FAILED : LOAD_FAILED);
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
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [confirmAuto, setConfirmAuto] = useState(false);

  useEffect(() => {
    let active = true;
    request().then(
      (settings) => active && setLoad({ state: "ready", settings }),
      (caught: unknown) =>
        active &&
        setLoad(
          isComingSoon(caught)
            ? { state: "soon" }
            : { state: "error", message: chefErrorText(caught, LOAD_FAILED) },
        ),
    );
    return () => {
      active = false;
    };
  }, [attempt]);

  if (load.state === "loading") {
    return (
      <ChefSection title="Orders" flush labelledBy="chef-order-settings">
        <div className="chef-list" aria-busy="true">
          <ChefSkeletonRow media="none" trailing="toggle" />
          <ChefSkeletonRow media="none" trailing="value" />
        </div>
      </ChefSection>
    );
  }
  if (load.state === "soon") {
    return (
      <ComingSoon
        title="Order settings are on their way"
        message="Automatic acceptance and a default cooking time will be here soon."
      />
    );
  }
  if (load.state === "error") {
    return (
      <ChefSection>
        <ChefEmpty
          icon={AlertTriangle}
          title="We couldn’t load your order settings"
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
              Try again
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
    setSaved("");
    try {
      setLoad({ state: "ready", settings: await request(next) });
      setSaved("Saved");
    } catch (caught) {
      setError(chefErrorText(caught, SAVE_FAILED));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ChefSection title="Orders" labelledBy="chef-order-settings">
        <div className="chef-setting-row">
          <div className="min-w-0 flex-1">
            <p id="chef-auto-accept" className="chef-setting-title">
              Accept orders automatically
            </p>
            <p id="chef-auto-accept-note" className="chef-section-note">
              Only while your kitchen is open
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
            Default cooking time{" "}
            <span className="font-normal text-[#6B6B6B]">
              · {minutes ? `${minutes} min` : "Not set"}
            </span>
          </p>
          <p className="chef-section-note">Used when a dish has no time set</p>
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
                {value} min
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
          {saving ? "Saving…" : saved}
        </p>
      </ChefSection>
      <Dialog
        open={confirmAuto}
        onOpenChange={setConfirmAuto}
        title="Accept new orders automatically?"
        description="Orders are accepted with your cooking time while your kitchen is open."
        footer={
          <>
            <button
              type="button"
              className={secondaryActionClass}
              onClick={() => setConfirmAuto(false)}
            >
              Not now
            </button>
            <button
              type="button"
              className="craves-primary-action w-full sm:w-auto"
              onClick={() => {
                setConfirmAuto(false);
                void save({ ...settings, autoAcceptOrders: true });
              }}
            >
              Turn on
            </button>
          </>
        }
      />
    </>
  );
}
