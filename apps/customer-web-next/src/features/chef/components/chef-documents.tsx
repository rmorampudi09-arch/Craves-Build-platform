"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent, type ComponentType } from "react";
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
  Upload,
} from "lucide-react";
import {
  ChefFlash,
  ChefNotice,
  ChefPill,
  ChefSection,
  ChefSkeleton,
} from "@/features/chef/components/chef-ui";
import {
  documentRows,
  hasNoApplication,
  uploadChoices,
  verificationBanner,
  type DocumentKind,
} from "@/features/chef/lib/chef-documents";
import {
  parseOnboardingState,
  type OnboardingState,
} from "@/features/chef-onboarding/lib/chef-onboarding-v2-contract";
import { chefErrorWords } from "@/features/chef/lib/chef-errors";
import { format, messages } from "@/shared/i18n/language";
import { useLanguage, useText } from "@/shared/i18n/language-context";
import { sessionFetch } from "@/shared/lib/session-fetch";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/shared/ui/overlays/dialog";
import { secondaryActionClass } from "@/shared/ui/overlays/overlay";

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
const MAX_BYTES = 10 * 1024 * 1024;
const PHOTO_TYPES = "image/jpeg,image/png";

const TEXT = messages({
  en: {
    uploadFailed: "We could not upload that. Please try again.",
    approvedNote: "Your documents are already approved. To change one, contact support: Craves checks it again before the change goes live.",
    notRefreshed: "Your documents didn’t refresh. Try again.", openFailed: "We couldn't open that file. Please try again.",
    photoOnly: "Choose a JPG or PNG photo.", photoOrPdf: "Choose a JPG, PNG or PDF file.", tooBig: "Choose a file no larger than 10 MB.",
    uploaded: "Document uploaded. Craves will check it.", refreshing: "Refreshing…", refresh: "Refresh document status",
    loading: "Loading your documents", loadFailed: "Your documents didn’t load. Check your connection and try again.",
    checkedWhenJoined: "Your documents were checked when you joined. To update them, contact support.", contactSupport: "Contact support",
    openFile: "{title}, {state}. Open the file",
    tapToView: "Tap a document to view it. To change an approved document, contact support. Craves checks it again before the change goes live.",
    keepCopy: "Your documents were checked when you joined Craves. Upload one here to keep a copy.",
    uploadAnother: "Upload another document", askUpdate: "Ask to update a document", uploadTitle: "Upload a document",
    uploadHelp: "Choose which one. Photos as JPG or PNG; ID proof can also be a PDF. Up to 10 MB.", uploading: "Uploading {name}…",
  },
  te: {
    uploadFailed: "అది అప్‌లోడ్ కాలేదు. దయచేసి మళ్లీ ప్రయత్నించండి.",
    approvedNote: "మీ పత్రాలు ఇప్పటికే ఆమోదించబడ్డాయి. ఒకటి మార్చాలంటే సహాయ బృందాన్ని సంప్రదించండి: మార్పు అమలయ్యే ముందు Craves దాన్ని మళ్లీ చెక్ చేస్తుంది.",
    notRefreshed: "మీ పత్రాలు రిఫ్రెష్ కాలేదు. మళ్లీ ప్రయత్నించండి.", openFailed: "ఆ ఫైల్ తెరవలేకపోయాం. దయచేసి మళ్లీ ప్రయత్నించండి.",
    photoOnly: "JPG లేదా PNG ఫోటో ఎంచుకోండి.", photoOrPdf: "JPG, PNG లేదా PDF ఫైల్ ఎంచుకోండి.", tooBig: "10 MB కంటే పెద్దది కాని ఫైల్ ఎంచుకోండి.",
    uploaded: "పత్రం అప్‌లోడ్ అయింది. Craves దాన్ని చెక్ చేస్తుంది.", refreshing: "రిఫ్రెష్ అవుతోంది…", refresh: "పత్రాల స్థితి మళ్లీ చూడండి",
    loading: "మీ పత్రాలు లోడ్ అవుతున్నాయి", loadFailed: "మీ పత్రాలు లోడ్ కాలేదు. ఇంటర్నెట్ చూసుకుని మళ్లీ ప్రయత్నించండి.",
    checkedWhenJoined: "మీరు చేరినప్పుడే మీ పత్రాలు చెక్ చేశారు. వాటిని మార్చాలంటే సహాయ బృందాన్ని సంప్రదించండి.", contactSupport: "సహాయ బృందాన్ని సంప్రదించండి",
    openFile: "{title}, {state}. ఫైల్ తెరవండి",
    tapToView: "చూడటానికి పత్రంపై నొక్కండి. ఆమోదించిన పత్రం మార్చాలంటే సహాయ బృందాన్ని సంప్రదించండి. మార్పు అమలయ్యే ముందు Craves దాన్ని మళ్లీ చెక్ చేస్తుంది.",
    keepCopy: "మీరు Craves లో చేరినప్పుడే మీ పత్రాలు చెక్ చేశారు. కాపీ ఉంచుకోవడానికి ఇక్కడ ఒకటి అప్‌లోడ్ చేయండి.",
    uploadAnother: "ఇంకో పత్రం అప్‌లోడ్ చేయండి", askUpdate: "పత్రం మార్చమని అడగండి", uploadTitle: "పత్రం అప్‌లోడ్ చేయండి",
    uploadHelp: "ఏది అని ఎంచుకోండి. ఫోటోలు JPG లేదా PNG గా; గుర్తింపు పత్రం PDF గా కూడా ఇవ్వవచ్చు. 10 MB వరకు.", uploading: "{name} అప్‌లోడ్ అవుతోంది…",
  },
  kn: {
    uploadFailed: "ಅದು ಅಪ್‌ಲೋಡ್ ಆಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    approvedNote: "ನಿಮ್ಮ ದಾಖಲೆಗಳು ಈಗಾಗಲೇ ಅನುಮೋದನೆಯಾಗಿವೆ. ಒಂದನ್ನು ಬದಲಾಯಿಸಲು ಸಹಾಯ ತಂಡವನ್ನು ಸಂಪರ್ಕಿಸಿ: ಬದಲಾವಣೆ ಜಾರಿಯಾಗುವ ಮೊದಲು Craves ಅದನ್ನು ಮತ್ತೆ ಪರಿಶೀಲಿಸುತ್ತದೆ.",
    notRefreshed: "ನಿಮ್ಮ ದಾಖಲೆಗಳು ರಿಫ್ರೆಶ್ ಆಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.", openFailed: "ಆ ಫೈಲ್ ತೆರೆಯಲು ಆಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    photoOnly: "JPG ಅಥವಾ PNG ಫೋಟೋ ಆಯ್ಕೆಮಾಡಿ.", photoOrPdf: "JPG, PNG ಅಥವಾ PDF ಫೈಲ್ ಆಯ್ಕೆಮಾಡಿ.", tooBig: "10 MB ಗಿಂತ ದೊಡ್ಡದಲ್ಲದ ಫೈಲ್ ಆಯ್ಕೆಮಾಡಿ.",
    uploaded: "ದಾಖಲೆ ಅಪ್‌ಲೋಡ್ ಆಗಿದೆ. Craves ಅದನ್ನು ಪರಿಶೀಲಿಸುತ್ತದೆ.", refreshing: "ರಿಫ್ರೆಶ್ ಆಗುತ್ತಿದೆ…", refresh: "ದಾಖಲೆಗಳ ಸ್ಥಿತಿ ಮತ್ತೆ ನೋಡಿ",
    loading: "ನಿಮ್ಮ ದಾಖಲೆಗಳು ಲೋಡ್ ಆಗುತ್ತಿವೆ", loadFailed: "ನಿಮ್ಮ ದಾಖಲೆಗಳು ಲೋಡ್ ಆಗಲಿಲ್ಲ. ಇಂಟರ್ನೆಟ್ ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    checkedWhenJoined: "ನೀವು ಸೇರಿದಾಗಲೇ ನಿಮ್ಮ ದಾಖಲೆಗಳನ್ನು ಪರಿಶೀಲಿಸಲಾಗಿದೆ. ಅವುಗಳನ್ನು ಬದಲಾಯಿಸಲು ಸಹಾಯ ತಂಡವನ್ನು ಸಂಪರ್ಕಿಸಿ.", contactSupport: "ಸಹಾಯ ತಂಡವನ್ನು ಸಂಪರ್ಕಿಸಿ",
    openFile: "{title}, {state}. ಫೈಲ್ ತೆರೆಯಿರಿ",
    tapToView: "ನೋಡಲು ದಾಖಲೆಯ ಮೇಲೆ ಒತ್ತಿ. ಅನುಮೋದಿತ ದಾಖಲೆ ಬದಲಾಯಿಸಲು ಸಹಾಯ ತಂಡವನ್ನು ಸಂಪರ್ಕಿಸಿ. ಬದಲಾವಣೆ ಜಾರಿಯಾಗುವ ಮೊದಲು Craves ಅದನ್ನು ಮತ್ತೆ ಪರಿಶೀಲಿಸುತ್ತದೆ.",
    keepCopy: "ನೀವು Craves ಗೆ ಸೇರಿದಾಗಲೇ ನಿಮ್ಮ ದಾಖಲೆಗಳನ್ನು ಪರಿಶೀಲಿಸಲಾಗಿದೆ. ಪ್ರತಿ ಇಟ್ಟುಕೊಳ್ಳಲು ಇಲ್ಲಿ ಒಂದನ್ನು ಅಪ್‌ಲೋಡ್ ಮಾಡಿ.",
    uploadAnother: "ಇನ್ನೊಂದು ದಾಖಲೆ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ", askUpdate: "ದಾಖಲೆ ಬದಲಾಯಿಸಲು ಕೇಳಿ", uploadTitle: "ದಾಖಲೆ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ",
    uploadHelp: "ಯಾವುದು ಎಂದು ಆಯ್ಕೆಮಾಡಿ. ಫೋಟೋಗಳು JPG ಅಥವಾ PNG; ಗುರುತಿನ ದಾಖಲೆ PDF ಕೂಡ ಆಗಬಹುದು. 10 MB ವರೆಗೆ.", uploading: "{name} ಅಪ್‌ಲೋಡ್ ಆಗುತ್ತಿದೆ…",
  },
});

/** Documents & verification: the status in words, each document with its own chip, and the ways to change one. */
export function ChefDocuments() {
  const text = useText(TEXT);
  const { language } = useLanguage();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [reload, setReload] = useState(0);
  // Which words to flash, so they follow the chef's language even when set from the load below.
  const [flash, setFlash] = useState<{
    message: "" | "notRefreshed" | "openFailed" | "uploaded";
    tone: "success" | "danger";
  }>({ message: "", tone: "success" });
  const [sheet, setSheet] = useState(false);
  const [uploading, setUploading] = useState("");
  const [uploadError, setUploadError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const chosen = useRef<{ type: string; title: string } | null>(null);

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

  function pick(choice: { type: string; title: string }) {
    if (uploading || !fileInput.current) return;
    chosen.current = choice;
    setUploadError("");
    fileInput.current.accept = choice.type.startsWith("KITCHEN_PHOTO_")
      ? PHOTO_TYPES
      : `${PHOTO_TYPES},application/pdf`;
    fileInput.current.click();
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    const choice = chosen.current;
    if (!file || !choice) return;
    if (!event.target.accept.split(",").includes(file.type))
      return setUploadError(
        choice.type.startsWith("KITCHEN_PHOTO_") ? text.photoOnly : text.photoOrPdf,
      );
    if (file.size < 1 || file.size > MAX_BYTES) return setUploadError(text.tooBig);
    setUploading(choice.title);
    let message = text.uploadFailed;
    try {
      const form = new FormData();
      form.set("documentType", choice.type);
      form.set("file", file, file.name);
      const response = await sessionFetch("/api/chef/application/proof-files", {
        method: "POST",
        body: form,
      });
      if (response.ok) {
        setSheet(false);
        setFlash({ message: "uploaded", tone: "success" });
        setReload((value) => value + 1);
        return;
      }
      // The BFF answers with safe (English) words for the refusals it knows; ours read in the chef's language.
      const body: unknown = await response.json().catch(() => null);
      const said =
        body && typeof body === "object" ? (body as { message?: unknown }).message : null;
      if (typeof said === "string" && said) message = chefErrorWords(said);
    } catch {
      // Offline: the general line.
    } finally {
      setUploading("");
    }
    setUploadError(message);
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
  const supportLink = (label: string, href: string, className = "chef-btn") => (
    <Link href={href} className={className}>
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
        <p role="alert" className="text-[0.9375rem] text-[#1A1A1A]">
          {text.loadFailed}
        </p>
        <div className="mt-3">{refresh}</div>
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
    const approved = onboarding.application.status === "APPROVED";
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
        <p className="px-1 text-[0.875rem] leading-6 text-[#6B6B6B]">
          {rows.length ? text.tapToView : text.keepCopy}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            className="chef-btn"
            onClick={() => {
              setUploadError("");
              setSheet(true);
            }}
          >
            <Upload className="h-5 w-5" aria-hidden="true" />
            {text.uploadAnother}
          </button>
          {refresh}
        </div>
        {supportLink(text.askUpdate, UPDATE_TICKET)}

        <Dialog open={sheet} onOpenChange={(open) => !uploading && setSheet(open)}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl bg-white p-5 text-[#1A1A1A]">
            <DialogTitle className="font-display text-lg font-bold">{text.uploadTitle}</DialogTitle>
            <DialogDescription className="text-[0.875rem] text-[#6B6B6B]">
              {text.uploadHelp}
            </DialogDescription>
            {approved ? (
              <div className="grid gap-3">
                <p className="text-[0.875rem] leading-6 text-[#6B6B6B]">{text.approvedNote}</p>
                {supportLink(text.contactSupport, CONTACT_TICKET, `${secondaryActionClass} gap-2`)}
              </div>
            ) : null}
            {/* The dialog sits outside the chef theme, so it uses the shared overlay actions. */}
            <div className="grid gap-2">
              {uploadChoices(onboarding, language).map((choice) => (
                <button
                  key={choice.type}
                  type="button"
                  className={`${secondaryActionClass} gap-2`}
                  disabled={Boolean(uploading)}
                  onClick={() => pick(choice)}
                >
                  <Upload className="h-5 w-5" aria-hidden="true" />
                  {choice.title}
                </button>
              ))}
            </div>
            <p role="status" className="text-[0.875rem] text-[#6B6B6B]">
              {uploading ? format(text.uploading, { name: uploading }) : ""}
            </p>
            {uploadError ? (
              <p role="alert" className="text-[0.875rem] font-medium text-[#C4200F]">
                {uploadError}
              </p>
            ) : null}
            <input
              ref={fileInput}
              type="file"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => void upload(event)}
            />
          </DialogContent>
        </Dialog>
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
