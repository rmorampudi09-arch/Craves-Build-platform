"use client";
import { sessionFetch } from "@/shared/lib/session-fetch";

import { chefApiError, ChefError, chefErrorText } from "@/features/chef/lib/chef-errors";
import { useCallback, useEffect, useRef, useState } from "react";
import { chefReadinessSummary, parseChefApplicationReadiness, type ChefApplicationReadiness } from "@/features/chef/lib/chef-readiness-contract";
import { format, messages } from "@/shared/i18n/language";
import { useText } from "@/shared/i18n/language-context";

const TEXT = messages({
  en: {
    unavailable: "We couldn’t check application readiness. Please try again.", documents: "Documents",
    checking: "Checking current approval requirements…", refresh: "Refresh",
    onlyApplication: "These checks are for your chef application only. They don’t certify food safety compliance or set up payouts.",
    approved: "Your Chef application is approved.", submit: "Submit your Chef details to begin review.",
    rejected: "Review the rejection reason and resubmit your application.", verifyEmail: "Verify your application email before approval.",
    waiting: "All required evidence is approved. Your application is awaiting the final admin decision.",
    count: "{approved} of {required} required documents approved.",
    APPLICANT_PHOTO: "Applicant photo", GOVERNMENT_ID_FRONT: "Government id front", GOVERNMENT_ID_BACK: "Government id back",
    TAX_ID_CARD: "Tax id card", KITCHEN_PHOTO_1: "Kitchen photo 1", KITCHEN_PHOTO_2: "Kitchen photo 2", FSSAI_LICENSE: "Fssai license",
    SELECTED_PROOF_FRONT: "Selected proof front", SELECTED_PROOF_BACK: "Selected proof back",
    MISSING: "Missing", UPLOADED: "Uploaded", APPROVED: "Approved", REJECTED: "Rejected",
  },
  te: {
    unavailable: "మీ దరఖాస్తు ఎంతవరకు సిద్ధంగా ఉందో చూడలేకపోయాం. దయచేసి మళ్లీ ప్రయత్నించండి.", documents: "పత్రాలు",
    checking: "ఆమోదానికి ఇప్పుడు ఏమి కావాలో చూస్తున్నాం…", refresh: "మళ్లీ చూడండి",
    onlyApplication: "ఈ తనిఖీలు మీ చెఫ్ దరఖాస్తు కోసం మాత్రమే. ఇవి ఆహార భద్రతకు సర్టిఫికేట్ కాదు, డబ్బు పంపడం కూడా మొదలుపెట్టవు.",
    approved: "మీ చెఫ్ దరఖాస్తు ఆమోదించబడింది.", submit: "Craves చూడటం మొదలుపెట్టడానికి మీ చెఫ్ వివరాలు పంపండి.",
    rejected: "తిరస్కరించిన కారణం చూసి, మీ దరఖాస్తు మళ్లీ పంపండి.", verifyEmail: "ఆమోదానికి ముందు మీ దరఖాస్తు ఈమెయిల్ ధృవీకరించండి.",
    waiting: "కావాల్సిన పత్రాలన్నీ ఆమోదించబడ్డాయి. మీ దరఖాస్తుపై Craves చివరి నిర్ణయం కోసం ఎదురుచూస్తోంది.",
    count: "కావాల్సిన {required} పత్రాల్లో {approved} ఆమోదించబడ్డాయి.",
    APPLICANT_PHOTO: "మీ ఫోటో", GOVERNMENT_ID_FRONT: "గుర్తింపు కార్డు (ముందు)", GOVERNMENT_ID_BACK: "గుర్తింపు కార్డు (వెనుక)",
    TAX_ID_CARD: "PAN కార్డు", KITCHEN_PHOTO_1: "వంటగది ఫోటో 1", KITCHEN_PHOTO_2: "వంటగది ఫోటో 2", FSSAI_LICENSE: "ఆహార లైసెన్స్ (FSSAI)",
    SELECTED_PROOF_FRONT: "చిరునామా రుజువు (ముందు)", SELECTED_PROOF_BACK: "చిరునామా రుజువు (వెనుక)",
    MISSING: "ఇంకా పంపలేదు", UPLOADED: "అప్‌లోడ్ అయింది", APPROVED: "ఆమోదించబడింది", REJECTED: "తిరస్కరించారు",
  },
  kn: {
    unavailable: "ನಿಮ್ಮ ಅರ್ಜಿ ಎಷ್ಟು ಸಿದ್ಧವಾಗಿದೆ ಎಂದು ನೋಡಲು ಆಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.", documents: "ದಾಖಲೆಗಳು",
    checking: "ಅನುಮೋದನೆಗೆ ಈಗ ಏನು ಬೇಕು ಎಂದು ನೋಡುತ್ತಿದ್ದೇವೆ…", refresh: "ಮತ್ತೆ ನೋಡಿ",
    onlyApplication: "ಈ ಪರಿಶೀಲನೆಗಳು ನಿಮ್ಮ ಚೆಫ್ ಅರ್ಜಿಗೆ ಮಾತ್ರ. ಇವು ಆಹಾರ ಸುರಕ್ಷತೆಯ ಪ್ರಮಾಣಪತ್ರವಲ್ಲ, ಹಣ ಪಾವತಿಯನ್ನೂ ಶುರುಮಾಡುವುದಿಲ್ಲ.",
    approved: "ನಿಮ್ಮ ಚೆಫ್ ಅರ್ಜಿ ಅನುಮೋದನೆಯಾಗಿದೆ.", submit: "Craves ಪರಿಶೀಲನೆ ಶುರುಮಾಡಲು ನಿಮ್ಮ ಚೆಫ್ ವಿವರಗಳನ್ನು ಕಳುಹಿಸಿ.",
    rejected: "ತಿರಸ್ಕರಿಸಿದ ಕಾರಣ ನೋಡಿ, ನಿಮ್ಮ ಅರ್ಜಿಯನ್ನು ಮತ್ತೆ ಕಳುಹಿಸಿ.", verifyEmail: "ಅನುಮೋದನೆಗೆ ಮೊದಲು ನಿಮ್ಮ ಅರ್ಜಿಯ ಇಮೇಲ್ ಪರಿಶೀಲಿಸಿ.",
    waiting: "ಬೇಕಾದ ಎಲ್ಲಾ ದಾಖಲೆಗಳು ಅನುಮೋದನೆಯಾಗಿವೆ. ನಿಮ್ಮ ಅರ್ಜಿ Craves ನ ಕೊನೆಯ ನಿರ್ಧಾರಕ್ಕಾಗಿ ಕಾಯುತ್ತಿದೆ.",
    count: "ಬೇಕಾದ {required} ದಾಖಲೆಗಳಲ್ಲಿ {approved} ಅನುಮೋದನೆಯಾಗಿವೆ.",
    APPLICANT_PHOTO: "ನಿಮ್ಮ ಫೋಟೋ", GOVERNMENT_ID_FRONT: "ಗುರುತಿನ ಚೀಟಿ (ಮುಂಭಾಗ)", GOVERNMENT_ID_BACK: "ಗುರುತಿನ ಚೀಟಿ (ಹಿಂಭಾಗ)",
    TAX_ID_CARD: "PAN ಕಾರ್ಡ್", KITCHEN_PHOTO_1: "ಅಡುಗೆಮನೆ ಫೋಟೋ 1", KITCHEN_PHOTO_2: "ಅಡುಗೆಮನೆ ಫೋಟೋ 2", FSSAI_LICENSE: "ಆಹಾರ ಪರವಾನಗಿ (FSSAI)",
    SELECTED_PROOF_FRONT: "ವಿಳಾಸ ಪುರಾವೆ (ಮುಂಭಾಗ)", SELECTED_PROOF_BACK: "ವಿಳಾಸ ಪುರಾವೆ (ಹಿಂಭಾಗ)",
    MISSING: "ಇನ್ನೂ ಕಳುಹಿಸಿಲ್ಲ", UPLOADED: "ಅಪ್‌ಲೋಡ್ ಆಗಿದೆ", APPROVED: "ಅನುಮೋದಿಸಲಾಗಿದೆ", REJECTED: "ತಿರಸ್ಕರಿಸಲಾಗಿದೆ",
  },
});
type Words = (typeof TEXT)["en"];

// chefReadinessSummary (chef-readiness-contract.ts) speaks English: its fixed sentences, by key. A new one shows as written.
const SUMMARY: Record<string, keyof Words> = {
  "Your Chef application is approved.": "approved",
  "Submit your Chef details to begin review.": "submit",
  "Review the rejection reason and resubmit your application.": "rejected",
  "Verify your application email before approval.": "verifyEmail",
  "All required evidence is approved. Your application is awaiting the final admin decision.": "waiting",
};

function summary(data: ChefApplicationReadiness, text: Words): string {
  const english = chefReadinessSummary(data);
  const counts = { approved: data.approvedDocumentCount, required: data.requiredDocumentCount };
  if (english === `${counts.approved} of ${counts.required} required documents approved.`) return format(text.count, counts);
  return Object.hasOwn(SUMMARY, english) ? text[SUMMARY[english]] : english;
}

export function ChefReadinessPanel() {
  const text = useText(TEXT);
  // Reads run on load and after an upload, not again when the chef changes language.
  const words = useRef(text);
  useEffect(() => {
    words.current = text;
  });
  const [data, setData] = useState<ChefApplicationReadiness | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [errorText, setErrorText] = useState("");
  const active = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setState("loading");
    const unavailable = words.current.unavailable;
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await sessionFetch("/api/chef/application/readiness", { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw chefApiError(response, await response.json().catch(() => null), unavailable);
      const parsed = parseChefApplicationReadiness(await response.json());
      if (!parsed) throw new ChefError(unavailable, "INVALID_READINESS_RESPONSE", response.status);
      if (active.current !== controller) return;
      setData(parsed);
      setState("ready");
    } catch (cause) {
      if (active.current !== controller) return;
      setData(null);
      setErrorText(chefErrorText(cause, unavailable));
      setState("error");
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);
  useEffect(() => {
    void load();
    const refresh = () => { void load(); };
    window.addEventListener("craves:chef-application-updated", refresh);
    return () => {
      window.removeEventListener("craves:chef-application-updated", refresh);
      const request = active.current;
      active.current = null;
      request?.abort();
    };
  }, [load]);

  return <section className="chef-section p-5 md:p-6" aria-busy={state === "loading"}>
    <h2 className="chef-section-title">{text.documents}</h2>
    {state === "loading" ? <p role="status" className="mt-2 text-sm">{text.checking}</p>
      : state === "error" ? <p role="alert" className="mt-2 text-sm">{errorText || text.unavailable}</p>
      : data ? <>
        <p className="mt-2 text-sm">{summary(data, text)}</p>
        <ul className="mt-4 space-y-2 text-sm">
          {data.documents.map(document => <li key={document.documentType} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#F1F3F5] px-4 py-3">
            <span className="font-semibold text-[#1A1A1A]">{text[document.documentType]}</span>
            <span className={`text-[0.8125rem] font-semibold ${document.status === "APPROVED" ? "text-[#0E6B4C]" : document.status === "REJECTED" ? "text-[#C4200F]" : "text-[#6B6B6B]"}`}>{text[document.status]}</span>
            {document.rejectionReason ? <p className="w-full text-[0.8125rem] text-[#C4200F]">{document.rejectionReason}</p> : null}
          </li>)}
        </ul>
        <p className="mt-3 text-[0.8125rem] leading-5 text-[#6B6B6B]">{text.onlyApplication}</p>
      </> : null}
    <button type="button" disabled={state === "loading"} onClick={() => void load()} className="chef-btn is-small mt-4">{text.refresh}</button>
  </section>;
}
