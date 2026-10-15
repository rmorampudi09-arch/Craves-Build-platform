"use client";
import { sessionFetch } from "@/features/auth/api/sessionFetch";

import { CHEF_ERROR_MESSAGES, chefApiError, ChefError, chefErrorText } from "@/features/chef/lib/chef-errors";
import { ChefEmpty, ChefSection, clockTime, dateTime } from "@/features/chef/components/chef-ui";
import { ChefKitchenSwitch } from "@/features/chef/components/chef-kitchen-switch";
import { ChefOpeningHours } from "@/features/chef/components/chef-opening-hours";
import { reloadKitchenSchedule } from "@/features/chef/api/chef-kitchen-schedule";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Check, CheckCircle2, Clock3, RefreshCw, X } from "lucide-react";
import {
  parseChefApplication,
  type ChefApplication,
} from "@/features/chef-onboarding/lib/chef-application-contract";
import {
  parseChefApplicationReadiness,
  type ChefApplicationReadiness,
} from "@/features/chef/lib/chef-readiness-contract";
import { parseChefKitchen } from "@/features/chef/lib/chef-kitchen-contract";
import type { ChefKitchen } from "@/features/chef/lib/chef-kitchen-types";
import {
  parseChefMenuItems,
  type ChefMenuItem,
} from "@/features/chef/lib/chef-menu-contract";
import { ChefLoading } from "@/features/chef/components/chef-loading";

type LoadState = "loading" | "ready" | "error";
type DocumentState = ChefApplicationReadiness["documents"][number]["status"];

/** Document names a chef recognises from the card in their hand. */
const DOCUMENT_NAMES: Record<string, string> = {
  APPLICANT_PHOTO: "Your photo",
  GOVERNMENT_ID_FRONT: "ID card (front)",
  GOVERNMENT_ID_BACK: "ID card (back)",
  TAX_ID_CARD: "PAN card",
  KITCHEN_PHOTO_1: "Kitchen photo 1",
  KITCHEN_PHOTO_2: "Kitchen photo 2",
  FSSAI_LICENSE: "Food licence (FSSAI)",
  SELECTED_PROOF_FRONT: "Address proof (front)",
  SELECTED_PROOF_BACK: "Address proof (back)",
};
const DOCUMENT_STATES: Record<DocumentState, string> = {
  MISSING: "Not sent",
  UPLOADED: "Being checked",
  APPROVED: "Checked",
  REJECTED: "Send again",
};

/** One thing customers need: a tick when it's done, and the one button that fixes it when it isn't. */
function CheckRow({
  done,
  title,
  detail,
  action,
  children,
}: {
  done: boolean;
  title: string;
  detail?: ReactNode;
  action?: { href: string; label: string };
  children?: ReactNode;
}) {
  return (
    <li className={`chef-check${done ? " is-done" : ""}`}>
      <span className="chef-check-mark" aria-hidden="true">
        {done ? <Check className="h-4 w-4" strokeWidth={3} /> : null}
      </span>
      <div className="min-w-0 flex-1">
        <p className="chef-check-title">
          {title}
          <span className="sr-only">{done ? " (done)" : " (not done yet)"}</span>
        </p>
        {detail ? <p className="chef-check-detail">{detail}</p> : null}
        {children}
        {action ? (
          <Link href={action.href} className={`chef-btn is-small mt-3${done ? "" : " is-primary"}`}>
            {action.label}
          </Link>
        ) : null}
      </div>
    </li>
  );
}

export function ChefOperationsWorkspace() {
  const [application, setApplication] = useState<ChefApplication | null>(null);
  const [readiness, setReadiness] = useState<ChefApplicationReadiness | null>(null);
  const [kitchen, setKitchen] = useState<ChefKitchen | null>(null);
  const [menu, setMenu] = useState<ChefMenuItem[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setState("loading");
    setError("");
    try {
      const [applicationResponse, kitchenResponse, menuResponse, readinessResponse] =
        await Promise.all([
          sessionFetch("/api/chef/application", {
            cache: "no-store",
            credentials: "same-origin",
          }),
          sessionFetch("/api/chef/kitchen", {
            cache: "no-store",
            credentials: "same-origin",
          }),
          sessionFetch("/api/chef/menu", {
            cache: "no-store",
            credentials: "same-origin",
          }),
          sessionFetch("/api/chef/application/readiness", {
            cache: "no-store",
            credentials: "same-origin",
          }),
        ]);

      const [applicationRaw, kitchenRaw, menuRaw, readinessRaw] = await Promise.all([
        applicationResponse.json().catch(() => null),
        kitchenResponse.json().catch(() => null),
        menuResponse.json().catch(() => null),
        readinessResponse.json().catch(() => null),
      ]);

      if (!applicationResponse.ok) throw chefApiError(applicationResponse, applicationRaw, "We couldn’t check your application.");
      if (!kitchenResponse.ok) throw chefApiError(kitchenResponse, kitchenRaw, "We couldn’t check your kitchen.");
      if (!menuResponse.ok) throw chefApiError(menuResponse, menuRaw, "We couldn’t check your menu.");
      if (!readinessResponse.ok) throw chefApiError(readinessResponse, readinessRaw, "We couldn’t check your documents.");

      const parsedApplication = parseChefApplication(applicationRaw);
      const parsedKitchen = kitchenRaw === null ? null : parseChefKitchen(kitchenRaw);
      const parsedMenu = parseChefMenuItems(menuRaw);
      const parsedReadiness = parseChefApplicationReadiness(readinessRaw);
      if (!parsedApplication) {
        throw new ChefError(CHEF_ERROR_MESSAGES.UNEXPECTED_RESPONSE, "INVALID_CHEF_APPLICATION_RESPONSE", 0);
      }
      if (kitchenRaw !== null && !parsedKitchen) {
        throw new ChefError(CHEF_ERROR_MESSAGES.UNEXPECTED_RESPONSE, "INVALID_KITCHEN_RESPONSE", 0);
      }
      if (!parsedMenu) {
        throw new ChefError(CHEF_ERROR_MESSAGES.UNEXPECTED_RESPONSE, "INVALID_MENU_RESPONSE", 0);
      }
      if (!parsedReadiness) {
        throw new ChefError(CHEF_ERROR_MESSAGES.UNEXPECTED_RESPONSE, "INVALID_READINESS_RESPONSE", 0);
      }

      setApplication(parsedApplication);
      setReadiness(parsedReadiness);
      setKitchen(parsedKitchen);
      setMenu(parsedMenu);
      setState("ready");
      setLastUpdatedAt(new Date());
    } catch (caught) {
      setError(chefErrorText(caught, "We couldn’t check your kitchen right now."));
      setState("error");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const metrics = useMemo(() => {
    const activeItems = menu.filter((item) => item.status === "ACTIVE");
    const availableItems = activeItems.filter((item) => item.available);
    const withImages = activeItems.filter((item) => item.images.length > 0);
    return {
      activeItems: activeItems.length,
      availableItems: availableItems.length,
      withImages: withImages.length,
    };
  }, [menu]);

  if (state === "loading") return <ChefLoading shape="checklist" head={false} label="Checking your kitchen" />;

  if (state === "error") {
    return (
      <ChefSection>
        <ChefEmpty
          icon={AlertTriangle}
          title="We couldn’t check your kitchen"
          text={error}
          action={
            <button type="button" onClick={() => void load()} className="chef-btn is-primary">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Try again
            </button>
          }
        />
      </ChefSection>
    );
  }

  const applicationApproved = application?.status === "APPROVED";
  const hasSupportedProofs =
    readiness !== null &&
    readiness.approvedDocumentCount === readiness.requiredDocumentCount;
  const kitchenActive = kitchen?.status === "ACTIVE";
  const locationMapped =
    typeof kitchen?.latitude === "number" &&
    typeof kitchen.longitude === "number";
  const hasDishOn = metrics.availableItems > 0;
  // What makes a kitchen show up for customers; photos help but don't block it.
  const steps = [applicationApproved, kitchenActive, locationMapped, hasDishOn];
  const discoverable = steps.every(Boolean);
  const todo = steps.filter((done) => !done).length;
  const missingPhotos = metrics.activeItems - metrics.withImages;
  const address = [kitchen?.addressLine1, kitchen?.areaName].filter(Boolean).join(", ");

  return (
    <div className="chef-stack">
      <section className={`chef-check-hero${discoverable ? " is-live" : ""}`} aria-live="polite">
        <span className="chef-check-hero-icon">
          {discoverable ? <CheckCircle2 className="h-7 w-7" aria-hidden="true" /> : <Clock3 className="h-7 w-7" aria-hidden="true" />}
        </span>
        <div className="min-w-0">
          <h2 className="chef-check-hero-title">
            {discoverable ? "Yes, customers can find your kitchen" : "Not yet"}
          </h2>
          <p className="chef-check-hero-text">
            {discoverable
              ? "Everything customers need is done."
              : `Finish ${todo === 1 ? "the step" : `the ${todo} steps`} without a tick below.`}
          </p>
        </div>
      </section>

      {kitchen ? <ChefKitchenSwitch kitchen={kitchen} onChange={setKitchen} /> : null}

      {kitchen ? <ChefOpeningHours /> : null}

      <ChefSection title="What customers need" flush labelledBy="chef-checklist">
        <ol className="chef-checklist">
          <CheckRow
            done={applicationApproved}
            title="Craves approved you"
            detail={
              applicationApproved
                ? application?.reviewedAt ? `Approved ${dateTime(application.reviewedAt)}` : "You’re a Craves chef."
                : application?.rejectionReason
                  ? `Craves asked for a change: ${application.rejectionReason}`
                  : "Craves is checking your details. This can take a few days."
            }
            action={
              applicationApproved
                ? { href: "/chef/application/status", label: "See application" }
                : { href: "/chef/application", label: "Open application" }
            }
          />
          <CheckRow
            done={kitchenActive}
            title="Kitchen is open"
            detail={
              !kitchen
                ? "Set up your kitchen first."
                : kitchen.status === "SUSPENDED"
                  ? "Craves has paused your kitchen. Ask Craves why."
                  : kitchenActive
                    ? "Customers can order now."
                    : "Use the switch above to open it."
            }
            action={kitchen ? undefined : { href: "/chef/kitchen", label: "Set up kitchen" }}
          />
          <CheckRow
            done={locationMapped}
            title="Pickup address is on the map"
            detail={locationMapped ? address || "Your address is saved." : "Add your address and put the pin on your home."}
            action={{ href: "/chef/kitchen", label: locationMapped ? "Check address" : "Add address" }}
          />
          <CheckRow
            done={hasDishOn}
            title="At least one dish is on"
            detail={
              metrics.activeItems === 0
                ? "Add a dish to your menu."
                : `${metrics.availableItems} of ${metrics.activeItems} ${metrics.activeItems === 1 ? "dish is" : "dishes are"} on today.`
            }
            action={{ href: "/chef/menu", label: hasDishOn ? "Go to menu" : metrics.activeItems === 0 ? "Add a dish" : "Turn a dish on" }}
          />
        </ol>
      </ChefSection>

      <ChefSection title="Also good to have" flush labelledBy="chef-checklist-extra">
        <ul className="chef-checklist">
          <CheckRow
            done={metrics.activeItems > 0 && missingPhotos === 0}
            title="Every dish has a photo"
            detail={
              metrics.activeItems === 0
                ? "Photos show once you add dishes."
                : missingPhotos === 0
                  ? "Customers see your food before they order."
                  : `${missingPhotos} ${missingPhotos === 1 ? "dish has" : "dishes have"} no photo. Customers see a plain picture instead.`
            }
            action={missingPhotos > 0 ? { href: "/chef/menu", label: "Add photos" } : undefined}
          />
          <CheckRow
            done={hasSupportedProofs}
            title="Your documents are checked"
            detail={
              readiness
                ? `${readiness.approvedDocumentCount} of ${readiness.requiredDocumentCount} checked by Craves.`
                : undefined
            }
          >
            {readiness?.documents.length ? (
              <ul className="chef-check-docs">
                {readiness.documents.map((document) => (
                  <li key={document.documentType} className={`is-${document.status.toLowerCase()}`}>
                    {document.status === "APPROVED" ? (
                      <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
                    ) : document.status === "UPLOADED" ? (
                      <Clock3 className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <X className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
                    )}
                    <span className="min-w-0 flex-1">{DOCUMENT_NAMES[document.documentType] ?? "Document"}</span>
                    <span className="chef-check-doc-state">{DOCUMENT_STATES[document.status]}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </CheckRow>
        </ul>
      </ChefSection>

      <div className="flex flex-col items-center gap-2 pt-1">
        <button type="button" disabled={refreshing} onClick={() => {
            void load(true);
            if (kitchen) void reloadKitchenSchedule();
          }} className="chef-btn is-small" aria-busy={refreshing}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
          Check again
        </button>
        {lastUpdatedAt ? <p className="text-[0.8125rem] text-[#6B6B6B]">Checked {clockTime(lastUpdatedAt.toISOString())}</p> : null}
      </div>
    </div>
  );
}

export default ChefOperationsWorkspace;
