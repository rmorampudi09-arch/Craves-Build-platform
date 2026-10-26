"use client";

import Link from "next/link";
import { useEffect, useState, type ComponentType } from "react";
import {
  AlertTriangle,
  ChevronRight,
  Clock3,
  FileText,
  Headset,
  IdCard,
  Image as ImageIcon,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  ChefEmpty,
  ChefFlash,
  ChefNotice,
  ChefPill,
  ChefSection,
  ChefSkeleton,
} from "@/features/chef/components/chef-ui";
import {
  documentRows,
  hasNoApplication,
  verificationBanner,
  type DocumentKind,
} from "@/features/chef/lib/chef-documents";
import {
  parseOnboardingState,
  type OnboardingState,
} from "@/features/chef-onboarding/lib/chef-onboarding-v2-contract";
import { format, messages } from "@/shared/i18n/language";
import { useLanguage, useText } from "@/shared/i18n/language-context";
import { sessionFetch } from "@/shared/lib/session-fetch";

type Load = { state: "loading" } | { state: "error" } | { state: "none" } | { state: "ready"; onboarding: OnboardingState };

const KIND_ICON: Record<DocumentKind, ComponentType<{ className?: string }>> = {
  id: IdCard,
  photo: ImageIcon,
  fssai: ShieldCheck,
  file: FileText,
};
const BANNER_ICON = { ok: ShieldCheck, wait: Clock3, problem: AlertTriangle };
const ticketHref = (topic: string) =>
  `/chef/support/new?topic=${encodeURIComponent(topic)}&from=/chef/documents`;
// As in the app: the button asks to update a document, Contact support opens the general documents ticket.
const UPDATE_TICKET = ticketHref("Update a document");
const CONTACT_TICKET = ticketHref("Update my documents");

const TEXT = messages({
  en: {
    notRefreshed: "Your documents didn’t refresh. Try again.", openFailed: "We couldn't open that file. Please try again.",
    refreshing: "Refreshing…", refresh: "Refresh document status",
    loading: "Loading your documents", loadFailed: "Your documents didn’t load", checkConnection: "Check your connection and try again.",
    checkedWhenJoined: "Your documents were checked when you joined. To update them, contact support.", contactSupport: "Contact support",
    openFile: "{title}, {state}. Open the file",
    tapToView: "Tap a document to view it. To change an approved document, contact support. Craves checks it again before the change goes live.",
    emptyList: "Your documents were checked when you joined Craves.",
    askUpdate: "Ask to update a document",
  },
  te: {
    notRefreshed: "మీ పత్రాలు రిఫ్రెష్ కాలేదు. మళ్లీ ప్రయత్నించండి.", openFailed: "ఆ ఫైల్ తెరవలేకపోయాం. దయచేసి మళ్లీ ప్రయత్నించండి.",
    refreshing: "రిఫ్రెష్ అవుతోంది…", refresh: "పత్రాల స్థితి మళ్లీ చూడండి",
    loading: "మీ పత్రాలు లోడ్ అవుతున్నాయి", loadFailed: "మీ పత్రాలు లోడ్ కాలేదు", checkConnection: "ఇంటర్నెట్ చూసుకుని మళ్లీ ప్రయత్నించండి.",
    checkedWhenJoined: "మీరు చేరినప్పుడే మీ పత్రాలు చెక్ చేశారు. వాటిని మార్చాలంటే సహాయ బృందాన్ని సంప్రదించండి.", contactSupport: "సహాయ బృందాన్ని సంప్రదించండి",
    openFile: "{title}, {state}. ఫైల్ తెరవండి",
    tapToView: "చూడటానికి పత్రంపై నొక్కండి. ఆమోదించిన పత్రం మార్చాలంటే సహాయ బృందాన్ని సంప్రదించండి. మార్పు అమలయ్యే ముందు Craves దాన్ని మళ్లీ చెక్ చేస్తుంది.",
    emptyList: "మీరు Craves లో చేరినప్పుడే మీ పత్రాలు చెక్ చేశారు.",
    askUpdate: "పత్రం మార్చమని అడగండి",
  },
  kn: {
    notRefreshed: "ನಿಮ್ಮ ದಾಖಲೆಗಳು ರಿಫ್ರೆಶ್ ಆಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.", openFailed: "ಆ ಫೈಲ್ ತೆರೆಯಲು ಆಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    refreshing: "ರಿಫ್ರೆಶ್ ಆಗುತ್ತಿದೆ…", refresh: "ದಾಖಲೆಗಳ ಸ್ಥಿತಿ ಮತ್ತೆ ನೋಡಿ",
    loading: "ನಿಮ್ಮ ದಾಖಲೆಗಳು ಲೋಡ್ ಆಗುತ್ತಿವೆ", loadFailed: "ನಿಮ್ಮ ದಾಖಲೆಗಳು ಲೋಡ್ ಆಗಲಿಲ್ಲ", checkConnection: "ಇಂಟರ್ನೆಟ್ ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    checkedWhenJoined: "ನೀವು ಸೇರಿದಾಗಲೇ ನಿಮ್ಮ ದಾಖಲೆಗಳನ್ನು ಪರಿಶೀಲಿಸಲಾಗಿದೆ. ಅವುಗಳನ್ನು ಬದಲಾಯಿಸಲು ಸಹಾಯ ತಂಡವನ್ನು ಸಂಪರ್ಕಿಸಿ.", contactSupport: "ಸಹಾಯ ತಂಡವನ್ನು ಸಂಪರ್ಕಿಸಿ",
    openFile: "{title}, {state}. ಫೈಲ್ ತೆರೆಯಿರಿ",
    tapToView: "ನೋಡಲು ದಾಖಲೆಯ ಮೇಲೆ ಒತ್ತಿ. ಅನುಮೋದಿತ ದಾಖಲೆ ಬದಲಾಯಿಸಲು ಸಹಾಯ ತಂಡವನ್ನು ಸಂಪರ್ಕಿಸಿ. ಬದಲಾವಣೆ ಜಾರಿಯಾಗುವ ಮೊದಲು Craves ಅದನ್ನು ಮತ್ತೆ ಪರಿಶೀಲಿಸುತ್ತದೆ.",
    emptyList: "ನೀವು Craves ಗೆ ಸೇರಿದಾಗಲೇ ನಿಮ್ಮ ದಾಖಲೆಗಳನ್ನು ಪರಿಶೀಲಿಸಲಾಗಿದೆ.",
    askUpdate: "ದಾಖಲೆ ಬದಲಾಯಿಸಲು ಕೇಳಿ",
  },
});

/** Documents & verification: the status in words and the documents from the application, to view only (app 1.34.6). */
export function ChefDocuments() {
  const text = useText(TEXT);
  const { language } = useLanguage();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [reload, setReload] = useState(0);
  // Which words to flash, so they follow the chef's language even when set from the load below.
  const [flash, setFlash] = useState<{
    message: "" | "notRefreshed" | "openFailed";
    tone: "success" | "danger";
  }>({ message: "", tone: "success" });

  useEffect(() => {
    let active = true;
    setRefreshing(true);
    void sessionFetch("/api/chef/onboarding", { cache: "no-store" })
      .then(async (response) => {
        const onboarding = response.ok
          ? parseOnboardingState(await response.json().catch(() => null))
          : null;
        if (!active) return;
        // An approved chef with no application on file: the documents were checked when they joined.
        if (response.status === 404 || (onboarding && hasNoApplication(onboarding)))
          setLoad({ state: "none" });
        else if (onboarding) setLoad({ state: "ready", onboarding });
        else throw new Error("DOCUMENTS_UNAVAILABLE");
      })
      .catch(() => {
        if (!active) return;
        // A failed refresh keeps the documents already on screen.
        setLoad((current) => (current.state === "ready" ? current : { state: "error" }));
        if (reload > 0) setFlash({ message: "notRefreshed", tone: "danger" });
      })
      .finally(() => {
        if (active) setRefreshing(false);
      });
    return () => {
      active = false;
    };
  }, [reload]);

  // The tab opens on the click itself, so a popup blocker lets it through; the short-lived link fills it in.
  async function openDocument(id: string) {
    const tab = window.open("", "_blank");
    try {
      const response = await sessionFetch(`/api/chef/onboarding/documents/${id}/preview`, {
        cache: "no-store",
      });
      const body: unknown = await response.json().catch(() => null);
      const url =
        response.ok && body && typeof body === "object" ? (body as { url?: unknown }).url : null;
      if (typeof url !== "string" || !url.startsWith("https://") || !tab)
        throw new Error("PREVIEW_UNAVAILABLE");
      tab.opener = null;
      tab.location.href = url;
    } catch {
      tab?.close();
      setFlash({ message: "openFailed", tone: "danger" });
    }
  }

  const refresh = (
    <button
      type="button"
      className="chef-btn is-quiet"
      disabled={refreshing}
      aria-busy={refreshing}
      onClick={() => setReload((value) => value + 1)}
    >
      <RefreshCw
        className={`h-4 w-4 ${refreshing ? "animate-spin motion-reduce:animate-none" : ""}`}
        aria-hidden="true"
      />
      {refreshing ? text.refreshing : text.refresh}
    </button>
  );
  const supportLink = (label: string, href: string) => (
    <Link href={href} className="chef-btn">
      <Headset className="h-5 w-5" aria-hidden="true" />
      {label}
    </Link>
  );

  let content;
  if (load.state === "loading") {
    content = (
      <div className="grid gap-3" role="status" aria-label={text.loading}>
        <ChefSkeleton className="h-20 w-full" />
        <ChefSkeleton className="h-48 w-full" />
      </div>
    );
  } else if (load.state === "error") {
    content = (
      <ChefSection>
        <ChefEmpty illustration="loadError" title={text.loadFailed} text={text.checkConnection} action={refresh} />
      </ChefSection>
    );
  } else if (load.state === "none") {
    content = (
      <>
        <ChefNotice icon={ShieldCheck}>{text.checkedWhenJoined}</ChefNotice>
        {supportLink(text.contactSupport, CONTACT_TICKET)}
      </>
    );
  } else {
    const { onboarding } = load;
    const banner = verificationBanner(onboarding, language);
    const rows = documentRows(onboarding, language);
    content = (
      <>
        <ChefNotice
          icon={BANNER_ICON[banner.tone]}
          tone={banner.tone === "problem" ? "danger" : "info"}
        >
          <strong className="block text-[0.9375rem]">{banner.title}</strong>
          {banner.message}
        </ChefNotice>
        {rows.length ? (
          <ChefSection flush>
            <ul className="chef-list">
              {rows.map((row) => {
                const Icon = KIND_ICON[row.kind];
                const inner = (
                  <>
                    <span className="chef-row-icon">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="chef-row-main">
                      <span className="chef-row-title block">{row.title}</span>
                      <span className="chef-row-meta block">{row.subtitle}</span>
                    </span>
                    <ChefPill tone={row.chip.tone}>{row.chip.label}</ChefPill>
                  </>
                );
                const id = row.previewId;
                return (
                  <li key={id ?? row.title}>
                    {id ? (
                      <button
                        type="button"
                        className="chef-row !border-0"
                        aria-label={format(text.openFile, { title: row.title, state: row.chip.label })}
                        onClick={() => void openDocument(id)}
                      >
                        {inner}
                        <ChevronRight className="chef-chevron h-5 w-5" aria-hidden="true" />
                      </button>
                    ) : (
                      <div className="chef-row">{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </ChefSection>
        ) : null}
        {/* View only: the documents came with the application, so a change goes through support (app 1.34.6). */}
        <p className="px-1 text-[0.875rem] leading-6 text-[#6B6B6B]">
          {rows.length ? text.tapToView : text.emptyList}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {supportLink(text.askUpdate, UPDATE_TICKET)}
          {refresh}
        </div>
      </>
    );
  }

  return (
    <div className="chef-stack" aria-busy={load.state === "loading"}>
      {content}
      <ChefFlash
        message={flash.message && text[flash.message]}
        tone={flash.tone}
        onClose={() => setFlash((current) => ({ ...current, message: "" }))}
      />
    </div>
  );
}
