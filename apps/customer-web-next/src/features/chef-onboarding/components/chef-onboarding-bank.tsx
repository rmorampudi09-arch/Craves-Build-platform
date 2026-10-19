"use client";
import { sessionFetch } from "@/features/auth/api/sessionFetch";

import { chefApiError, ChefError, chefErrorText } from "@/features/chef/lib/chef-errors";
import { useEffect, useRef, useState } from "react";
import { Building2, CheckCircle2, Eye, EyeOff, Landmark, Lock, RefreshCw } from "lucide-react";
import {
  bankConsentVersion,
  bankStatusSchema,
  bankSubmissionSchema,
  type BankStatus,
} from "@/features/admin/finance/lib/bank-onboarding-contract";
import { bankCanContinue, sameChefBankName } from "@/features/chef-onboarding/lib/chef-onboarding-flow";
import {
  Card,
  FieldError,
  FieldShell,
  LockedInput,
  Note,
  Spinner,
  StatusChip,
} from "@/features/chef-onboarding/components/chef-onboarding-ui";
import { messages } from "@/shared/i18n/language";
import { useText } from "@/shared/i18n/language-context";

const TEXT = messages({
  en: {
    ifscNotFound: "We couldn’t find this IFSC. Check it and try again.", lookupFailed: "Bank branch lookup failed.",
    accountInvalid: "Enter a bank account number with 6 to 24 digits.", mismatch: "The account numbers don’t match.",
    ifscInvalid: "Enter a valid 11-character IFSC code.", consentNeeded: "Confirm this is your account to continue.",
    nameInvalid: "Check your account holder name in Basic details.", waitBranch: "Wait for the bank name and branch to load from your IFSC.",
    sessionExpired: "Your session expired. Sign in again to save your bank details.",
    changed: "Your bank details changed or a payout is pending. Refresh bank status before trying again.",
    limit: "The bank-change limit has been reached. Try again after the current limit resets.",
    unconfirmed: "We could not confirm your bank submission. Retry uses the same request, so it will not create a duplicate.",
    saveFailed: "Bank details could not be saved.",
    savedAccount: "Saved account", account: "Account", bank: "Bank", status: "Status", saved: "Saved", attention: "Needs attention",
    useDifferent: "Use a different account", checking: "Checking bank account setup…",
    unavailable: "We couldn’t load your bank details. Your application is still saved.",
    notOpen: "Adding a bank account isn’t open on Craves yet, so this step can’t be finished right now. Everything else you’ve entered is saved.",
    refresh: "Refresh bank status", accountDetails: "Account details", accountDetailsHelper: "Where we send your earnings.",
    holderName: "Account holder name", holderHelper: "From your basic details.", accountNumber: "Bank account number",
    hide: "Hide account number", show: "Show account number", confirmNumber: "Confirm bank account number", match: "Account numbers match",
    ifsc: "IFSC code", finding: "Finding your bank…", ifscHelper: "Bank name and branch fill in from your IFSC.",
    retryLookup: "Retry branch lookup", ifscExample: "For example, HDFC0001234", bankName: "Bank name", branch: "Branch",
    consentLabel: "Consent to bank verification",
    consent: "This is my bank account. I agree that Craves may share these details and my contact information with Razorpay to validate the account and pay my earnings.",
    confirmTitle: "Confirm your bank details", holder: "Account holder", number: "Account number",
    checkCarefully: "Please check these details carefully. Your earnings will be transferred to this bank account.",
    reenter: "Re-enter bank details",
  },
  te: {
    ifscNotFound: "ఈ IFSC దొరకలేదు. చూసి మళ్లీ ప్రయత్నించండి.", lookupFailed: "బ్యాంక్ బ్రాంచ్ వివరాలు రాలేదు.",
    accountInvalid: "6 నుంచి 24 అంకెల బ్యాంక్ ఖాతా నంబర్ రాయండి.", mismatch: "రెండు ఖాతా నంబర్లు ఒకటిగా లేవు.",
    ifscInvalid: "సరైన 11 అక్షరాల IFSC కోడ్ రాయండి.", consentNeeded: "కొనసాగడానికి, ఇది మీ ఖాతానే అని టిక్ పెట్టండి.",
    nameInvalid: "మీ వివరాలు భాగంలో మీ పేరు సరిగ్గా ఉందో చూడండి.", waitBranch: "మీ IFSC నుంచి బ్యాంక్ పేరు, బ్రాంచ్ వచ్చే వరకు ఆగండి.",
    sessionExpired: "మీ సెషన్ ముగిసింది. బ్యాంక్ వివరాలు సేవ్ చేయడానికి మళ్లీ సైన్ ఇన్ చేయండి.",
    changed: "మీ బ్యాంక్ వివరాలు మారాయి, లేదా ఒక చెల్లింపు ఆగి ఉంది. మళ్లీ ప్రయత్నించే ముందు బ్యాంక్ స్థితి మళ్లీ చూడండి.",
    limit: "బ్యాంక్ మార్చే పరిమితి అయిపోయింది. పరిమితి మళ్లీ మొదలైన తర్వాత ప్రయత్నించండి.",
    unconfirmed: "మీ బ్యాంక్ వివరాలు అందాయో లేదో తెలియలేదు. మళ్లీ ప్రయత్నిస్తే అదే అభ్యర్థన వెళ్తుంది, రెండుసార్లు నమోదు కాదు.",
    saveFailed: "బ్యాంక్ వివరాలు సేవ్ కాలేదు.",
    savedAccount: "సేవ్ చేసిన ఖాతా", account: "ఖాతా", bank: "బ్యాంక్", status: "స్థితి", saved: "సేవ్ అయింది", attention: "సరిచేయాలి",
    useDifferent: "వేరే ఖాతా వాడండి", checking: "బ్యాంక్ ఖాతా సెటప్ చూస్తున్నాం…",
    unavailable: "మీ బ్యాంక్ వివరాలు లోడ్ కాలేదు. మీ దరఖాస్తు సేవ్ అయే ఉంది.",
    notOpen: "Craves లో బ్యాంక్ ఖాతా జోడించడం ఇంకా మొదలవలేదు, అందుకే ఈ దశ ఇప్పుడు పూర్తి చేయలేరు. మీరు రాసిన మిగతావన్నీ సేవ్ అయ్యాయి.",
    refresh: "బ్యాంక్ స్థితి మళ్లీ చూడండి", accountDetails: "ఖాతా వివరాలు", accountDetailsHelper: "మీ సంపాదన మేము ఇక్కడికే పంపుతాం.",
    holderName: "ఖాతాదారు పేరు", holderHelper: "మీ వివరాల నుంచి తీసుకున్నాం.", accountNumber: "బ్యాంక్ ఖాతా నంబర్",
    hide: "ఖాతా నంబర్ దాచండి", show: "ఖాతా నంబర్ చూపండి", confirmNumber: "బ్యాంక్ ఖాతా నంబర్ మళ్లీ రాయండి", match: "ఖాతా నంబర్లు సరిపోయాయి",
    ifsc: "IFSC కోడ్", finding: "మీ బ్యాంక్ వెతుకుతున్నాం…", ifscHelper: "మీ IFSC నుంచి బ్యాంక్ పేరు, బ్రాంచ్ వాటంతట అవే వస్తాయి.",
    retryLookup: "బ్రాంచ్ మళ్లీ వెతకండి", ifscExample: "ఉదాహరణకు, HDFC0001234", bankName: "బ్యాంక్ పేరు", branch: "బ్రాంచ్",
    consentLabel: "బ్యాంక్ ధృవీకరణకు అంగీకారం",
    consent: "ఇది నా బ్యాంక్ ఖాతా. ఖాతాను సరిచూడటానికి, నా సంపాదన పంపడానికి Craves ఈ వివరాలు, నా సంప్రదింపు వివరాలు Razorpay తో పంచుకోవచ్చు అని ఒప్పుకుంటున్నాను.",
    confirmTitle: "మీ బ్యాంక్ వివరాలు సరిచూడండి", holder: "ఖాతాదారు", number: "ఖాతా నంబర్",
    checkCarefully: "ఈ వివరాలు జాగ్రత్తగా చూడండి. మీ సంపాదన ఈ బ్యాంక్ ఖాతాకే వస్తుంది.",
    reenter: "బ్యాంక్ వివరాలు మళ్లీ రాయండి",
  },
  kn: {
    ifscNotFound: "ಈ IFSC ಸಿಗಲಿಲ್ಲ. ನೋಡಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.", lookupFailed: "ಬ್ಯಾಂಕ್ ಶಾಖೆಯ ವಿವರ ಸಿಗಲಿಲ್ಲ.",
    accountInvalid: "6 ರಿಂದ 24 ಅಂಕಿಯ ಬ್ಯಾಂಕ್ ಖಾತೆ ಸಂಖ್ಯೆ ಬರೆಯಿರಿ.", mismatch: "ಎರಡು ಖಾತೆ ಸಂಖ್ಯೆಗಳು ಒಂದೇ ಇಲ್ಲ.",
    ifscInvalid: "ಸರಿಯಾದ 11 ಅಕ್ಷರದ IFSC ಕೋಡ್ ಬರೆಯಿರಿ.", consentNeeded: "ಮುಂದುವರಿಯಲು, ಇದು ನಿಮ್ಮದೇ ಖಾತೆ ಎಂದು ಟಿಕ್ ಮಾಡಿ.",
    nameInvalid: "ನಿಮ್ಮ ವಿವರಗಳು ಭಾಗದಲ್ಲಿ ನಿಮ್ಮ ಹೆಸರು ಸರಿಯಾಗಿದೆಯೇ ನೋಡಿ.", waitBranch: "ನಿಮ್ಮ IFSC ಯಿಂದ ಬ್ಯಾಂಕ್ ಹೆಸರು ಮತ್ತು ಶಾಖೆ ಬರುವವರೆಗೆ ಕಾಯಿರಿ.",
    sessionExpired: "ನಿಮ್ಮ ಸೆಷನ್ ಮುಗಿದಿದೆ. ಬ್ಯಾಂಕ್ ವಿವರ ಉಳಿಸಲು ಮತ್ತೆ ಸೈನ್ ಇನ್ ಮಾಡಿ.",
    changed: "ನಿಮ್ಮ ಬ್ಯಾಂಕ್ ವಿವರ ಬದಲಾಗಿದೆ, ಅಥವಾ ಒಂದು ಪಾವತಿ ಬಾಕಿ ಇದೆ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸುವ ಮೊದಲು ಬ್ಯಾಂಕ್ ಸ್ಥಿತಿ ಮತ್ತೆ ನೋಡಿ.",
    limit: "ಬ್ಯಾಂಕ್ ಬದಲಾಯಿಸುವ ಮಿತಿ ಮುಗಿದಿದೆ. ಮಿತಿ ಮತ್ತೆ ಶುರುವಾದ ನಂತರ ಪ್ರಯತ್ನಿಸಿ.",
    unconfirmed: "ನಿಮ್ಮ ಬ್ಯಾಂಕ್ ವಿವರ ತಲುಪಿತೇ ಎಂದು ಗೊತ್ತಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿದರೆ ಅದೇ ಮನವಿ ಹೋಗುತ್ತದೆ, ಎರಡು ಬಾರಿ ದಾಖಲಾಗುವುದಿಲ್ಲ.",
    saveFailed: "ಬ್ಯಾಂಕ್ ವಿವರ ಉಳಿಸಲು ಆಗಲಿಲ್ಲ.",
    savedAccount: "ಉಳಿಸಿದ ಖಾತೆ", account: "ಖಾತೆ", bank: "ಬ್ಯಾಂಕ್", status: "ಸ್ಥಿತಿ", saved: "ಉಳಿಸಲಾಗಿದೆ", attention: "ಸರಿಪಡಿಸಿ",
    useDifferent: "ಬೇರೆ ಖಾತೆ ಬಳಸಿ", checking: "ಬ್ಯಾಂಕ್ ಖಾತೆ ಸೆಟಪ್ ನೋಡುತ್ತಿದ್ದೇವೆ…",
    unavailable: "ನಿಮ್ಮ ಬ್ಯಾಂಕ್ ವಿವರ ಲೋಡ್ ಆಗಲಿಲ್ಲ. ನಿಮ್ಮ ಅರ್ಜಿ ಉಳಿದೇ ಇದೆ.",
    notOpen: "Craves ನಲ್ಲಿ ಬ್ಯಾಂಕ್ ಖಾತೆ ಸೇರಿಸುವುದು ಇನ್ನೂ ಶುರುವಾಗಿಲ್ಲ, ಹಾಗಾಗಿ ಈ ಹಂತ ಈಗ ಮುಗಿಸಲು ಆಗುವುದಿಲ್ಲ. ನೀವು ಬರೆದ ಉಳಿದೆಲ್ಲವೂ ಉಳಿಸಲಾಗಿದೆ.",
    refresh: "ಬ್ಯಾಂಕ್ ಸ್ಥಿತಿ ಮತ್ತೆ ನೋಡಿ", accountDetails: "ಖಾತೆ ವಿವರಗಳು", accountDetailsHelper: "ನಿಮ್ಮ ಗಳಿಕೆಯನ್ನು ನಾವು ಇಲ್ಲಿಗೇ ಕಳುಹಿಸುತ್ತೇವೆ.",
    holderName: "ಖಾತೆದಾರರ ಹೆಸರು", holderHelper: "ನಿಮ್ಮ ವಿವರಗಳಿಂದ ತೆಗೆದುಕೊಳ್ಳಲಾಗಿದೆ.", accountNumber: "ಬ್ಯಾಂಕ್ ಖಾತೆ ಸಂಖ್ಯೆ",
    hide: "ಖಾತೆ ಸಂಖ್ಯೆ ಮರೆಮಾಡಿ", show: "ಖಾತೆ ಸಂಖ್ಯೆ ತೋರಿಸಿ", confirmNumber: "ಬ್ಯಾಂಕ್ ಖಾತೆ ಸಂಖ್ಯೆ ಮತ್ತೆ ಬರೆಯಿರಿ", match: "ಖಾತೆ ಸಂಖ್ಯೆಗಳು ಹೊಂದಿಕೆಯಾಗಿವೆ",
    ifsc: "IFSC ಕೋಡ್", finding: "ನಿಮ್ಮ ಬ್ಯಾಂಕ್ ಹುಡುಕುತ್ತಿದ್ದೇವೆ…", ifscHelper: "ನಿಮ್ಮ IFSC ಯಿಂದ ಬ್ಯಾಂಕ್ ಹೆಸರು ಮತ್ತು ಶಾಖೆ ತಾನಾಗಿಯೇ ಬರುತ್ತವೆ.",
    retryLookup: "ಶಾಖೆ ಮತ್ತೆ ಹುಡುಕಿ", ifscExample: "ಉದಾಹರಣೆಗೆ, HDFC0001234", bankName: "ಬ್ಯಾಂಕ್ ಹೆಸರು", branch: "ಶಾಖೆ",
    consentLabel: "ಬ್ಯಾಂಕ್ ಪರಿಶೀಲನೆಗೆ ಒಪ್ಪಿಗೆ",
    consent: "ಇದು ನನ್ನ ಬ್ಯಾಂಕ್ ಖಾತೆ. ಖಾತೆಯನ್ನು ಪರಿಶೀಲಿಸಲು ಮತ್ತು ನನ್ನ ಗಳಿಕೆ ಕಳುಹಿಸಲು Craves ಈ ವಿವರಗಳನ್ನು ಮತ್ತು ನನ್ನ ಸಂಪರ್ಕ ವಿವರಗಳನ್ನು Razorpay ಜೊತೆ ಹಂಚಿಕೊಳ್ಳಬಹುದು ಎಂದು ಒಪ್ಪುತ್ತೇನೆ.",
    confirmTitle: "ನಿಮ್ಮ ಬ್ಯಾಂಕ್ ವಿವರ ಖಚಿತಪಡಿಸಿ", holder: "ಖಾತೆದಾರರು", number: "ಖಾತೆ ಸಂಖ್ಯೆ",
    checkCarefully: "ಈ ವಿವರಗಳನ್ನು ಜಾಗ್ರತೆಯಿಂದ ನೋಡಿ. ನಿಮ್ಮ ಗಳಿಕೆ ಈ ಬ್ಯಾಂಕ್ ಖಾತೆಗೇ ಬರುತ್ತದೆ.",
    reenter: "ಬ್ಯಾಂಕ್ ವಿವರ ಮತ್ತೆ ಬರೆಯಿರಿ",
  },
});

type Props = {
  name: string;
  bank: BankStatus | null;
  unavailable: boolean;
  busy: boolean;
  onSaved: (bank: BankStatus) => void;
  onBusy: (busy: boolean) => void;
  onRefresh: () => void;
  /** Lets the popup footer label follow the step: entering, confirming or keeping a saved account. */
  onModeChange?: (mode: BankFormMode) => void;
};
export type BankFormMode = "entry" | "confirm" | "saved";
type FieldKey = "account" | "confirmation" | "ifsc" | "consent" | "form";

export function ChefOnboardingBank({
  name,
  bank,
  unavailable,
  busy,
  onSaved,
  onBusy,
  onRefresh,
  onModeChange,
}: Props) {
  const text = useText(TEXT);
  const [account, setAccount] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [ifsc, setIfsc] = useState("");
  const [consent, setConsent] = useState(false),
    [confirming, setConfirmingState] = useState(false),
    [error, setError] = useState<{ field: FieldKey; message: string } | null>(null);
  const [showAccount, setShowAccount] = useState(false);
  const [changing, setChanging] = useState(false);
  const request = useRef<ReturnType<typeof bankSubmissionSchema.parse> | null>(null);
  const inFlight = useRef(false);
  const confirmPanel = useRef<HTMLDivElement>(null);
  const [branch, setBranch] = useState<{
    ifsc: string;
    bankName: string;
    branchName: string;
  } | null>(null);
  const [lookup, setLookup] = useState<"idle" | "loading" | "failed">("idle");
  const [lookupError, setLookupError] = useState("");
  const [lookupRetry, setLookupRetry] = useState(0);
  function setConfirming(value: boolean) {
    setConfirmingState(value);
  }
  useEffect(() => {
    setBranch(null);
    setLookupError("");
    setLookup("idle");
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) return;
    const controller = new AbortController();
    setLookup("loading");
    void sessionFetch(`/api/chef-onboarding/bank/ifsc/${ifsc}`, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = (await response.json()) as {
          ifsc?: string;
          bankName?: string;
          branchName?: string;
          message?: string;
        };
        if (!response.ok || data.ifsc !== ifsc || !data.bankName || !data.branchName)
          throw new Error(data.message ?? text.ifscNotFound);
        if (!controller.signal.aborted) {
          setBranch({ ifsc, bankName: data.bankName, branchName: data.branchName });
          setLookup("idle");
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted) {
          setLookup("failed");
          setLookupError(chefErrorText(failure, text.lookupFailed));
        }
      });
    return () => controller.abort();
  }, [ifsc, lookupRetry, text]);
  useEffect(() => {
    if (confirming) confirmPanel.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [confirming]);
  function changed() {
    request.current = null;
    setError(null);
  }
  function confirm() {
    const result = bankSubmissionSchema.safeParse({
      requestKey: crypto.randomUUID(),
      expectedCurrentId: bank?.id ?? null,
      accountHolderName: name,
      accountNumber: account,
      accountNumberConfirmation: confirmation,
      ifsc,
      consent,
      consentVersion: bankConsentVersion,
    });
    if (!result.success) {
      const next: { field: FieldKey; message: string } = !/^[0-9]{6,24}$/.test(account)
        ? { field: "account", message: text.accountInvalid }
        : account !== confirmation
          ? { field: "confirmation", message: text.mismatch }
          : !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)
            ? { field: "ifsc", message: text.ifscInvalid }
            : !consent
              ? { field: "consent", message: text.consentNeeded }
              : { field: "form", message: text.nameInvalid };
      setError(next);
      document.getElementById(`chef-bank-${next.field}`)?.focus();
      return;
    }
    if (!branch || branch.ifsc !== ifsc) {
      setError({ field: "ifsc", message: text.waitBranch });
      document.getElementById("chef-bank-ifsc")?.focus();
      return;
    }
    request.current = result.data;
    setConfirming(true);
    setError(null);
  }
  async function save() {
    if (!request.current || busy || inFlight.current || !bank?.automaticActivation) return;
    inFlight.current = true;
    onBusy(true);
    setError(null);
    try {
      const response = await sessionFetch("/api/chef-onboarding/bank", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request.current),
        signal: AbortSignal.timeout(45000),
      });
      const raw: unknown = await response.json().catch(() => null);
      if (!response.ok)
        throw new ChefError(
          response.status === 401
            ? text.sessionExpired
            : response.status === 409
              ? text.changed
              : response.status === 429
                ? text.limit
                : text.unconfirmed,
          chefApiError(response, raw, "").ref,
          response.status,
        );
      const result = bankStatusSchema.parse(raw);
      onSaved(result);
      if (!bankCanContinue(result)) {
        setError({ field: "form", message: result.message });
        return;
      }
      request.current = null;
      setAccount("");
      setConfirmation("");
      setIfsc("");
      setConsent(false);
      setConfirming(false);
      setChanging(false);
    } catch (failure) {
      setError({ field: "form", message: chefErrorText(failure, text.saveFailed) });
    } finally {
      inFlight.current = false;
      onBusy(false);
    }
  }
  const editable = Boolean(bank?.automaticActivation);
  const saved = bankCanContinue(bank) && sameChefBankName(bank?.accountHolderName, name);
  const mode: BankFormMode = confirming
    ? "confirm"
    : saved && !changing && !account && !confirmation && !ifsc
      ? "saved"
      : "entry";
  useEffect(() => {
    onModeChange?.(mode);
  }, [mode, onModeChange]);
  const showFields = editable && (!bank?.id || changing || !saved);
  const errorFor = (field: FieldKey) => (error?.field === field ? error.message : null);
  const matches = account.length >= 6 && confirmation === account;
  return (
    <form
      id="chef-bank-form"
      className="cob-stack"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (busy || inFlight.current) return;
        if (saved && !account && !confirmation && !ifsc) {
          onSaved(bank!);
          return;
        }
        if (confirming) void save();
        else confirm();
      }}
    >
      {bank?.id ? (
        <Card
          icon={<Landmark size={20} aria-hidden="true" />}
          title={text.savedAccount}
          subtitle={bank.message}
        >
          <dl className="cob-rows">
            <div className="cob-row">
              <dt>{text.account}</dt>
              <dd className="cob-mono">•••• {bank.lastFour}</dd>
            </div>
            {bank.bankName ? (
              <div className="cob-row">
                <dt>{text.bank}</dt>
                <dd>
                  {bank.bankName}
                  {bank.branchName ? `, ${bank.branchName}` : ""}
                </dd>
              </div>
            ) : null}
            <div className="cob-row">
              <dt>{text.status}</dt>
              <dd>
                {bankCanContinue(bank) ? (
                  <StatusChip tone="complete">{text.saved}</StatusChip>
                ) : (
                  <StatusChip tone="attention">{text.attention}</StatusChip>
                )}
              </dd>
            </div>
          </dl>
          {editable && saved && !changing ? (
            <button
              type="button"
              className="cob-link"
              style={{ marginTop: 6 }}
              onClick={() => setChanging(true)}
            >
              {text.useDifferent}
            </button>
          ) : null}
        </Card>
      ) : null}

      {!bank && !unavailable ? (
        <Note tone="neutral" role="status">
          {text.checking}
        </Note>
      ) : unavailable || !editable ? (
        <Note tone="neutral" role="status">
          {unavailable ? text.unavailable : text.notOpen}
          <br />
          <button type="button" className="cob-link" disabled={busy} onClick={onRefresh}>
            <RefreshCw size={15} aria-hidden="true" />
            {text.refresh}
          </button>
        </Note>
      ) : null}

      {showFields ? (
        <Card
          icon={<Building2 size={20} aria-hidden="true" />}
          title={text.accountDetails}
          subtitle={text.accountDetailsHelper}
        >
          <div className="cob-fields">
            <LockedInput
              id="chef-bank-holder"
              label={text.holderName}
              value={name}
              helper={text.holderHelper}
            />
            <FieldShell
              id="chef-bank-account"
              label={text.accountNumber}
              error={errorFor("account")}
            >
              <div className="cob-control">
                <input
                  id="chef-bank-account"
                  aria-label={text.accountNumber}
                  className="cob-input cob-input--with-trailing-icon cob-mono"
                  autoComplete="off"
                  // Masked, but not a password: password managers should not offer to save it.
                  data-1p-ignore
                  data-lpignore="true"
                  data-bwignore="true"
                  data-form-type="other"
                  type={showAccount ? "text" : "password"}
                  inputMode="numeric"
                  maxLength={24}
                  value={account}
                  disabled={busy || confirming}
                  aria-invalid={Boolean(errorFor("account")) || undefined}
                  onChange={(event) => {
                    changed();
                    setAccount(event.target.value.replace(/\D/g, ""));
                  }}
                />
                <button
                  type="button"
                  className="cob-trailing-button"
                  aria-label={showAccount ? text.hide : text.show}
                  onClick={() => setShowAccount((value) => !value)}
                >
                  {showAccount ? (
                    <EyeOff size={18} aria-hidden="true" />
                  ) : (
                    <Eye size={18} aria-hidden="true" />
                  )}
                </button>
              </div>
            </FieldShell>
            <FieldShell
              id="chef-bank-confirmation"
              label={text.confirmNumber}
              error={errorFor("confirmation")}
              after={
                matches && !errorFor("confirmation") ? (
                  <span className="cob-success-line">
                    <CheckCircle2 size={16} aria-hidden="true" />
                    {text.match}
                  </span>
                ) : null
              }
            >
              <input
                id="chef-bank-confirmation"
                aria-label={text.confirmNumber}
                className="cob-input cob-mono"
                autoComplete="off"
                inputMode="numeric"
                maxLength={24}
                value={confirmation}
                disabled={busy || confirming}
                aria-invalid={Boolean(errorFor("confirmation")) || undefined}
                onPaste={(event) => event.preventDefault()}
                onChange={(event) => {
                  changed();
                  setConfirmation(event.target.value.replace(/\D/g, ""));
                }}
              />
            </FieldShell>
            <FieldShell
              id="chef-bank-ifsc"
              label={text.ifsc}
              helper={lookup === "loading" ? text.finding : text.ifscHelper}
              error={errorFor("ifsc") ?? (lookup === "failed" ? lookupError : null)}
              after={
                lookup === "failed" ? (
                  <button
                    type="button"
                    className="cob-link"
                    onClick={() => setLookupRetry((value) => value + 1)}
                  >
                    <RefreshCw size={15} aria-hidden="true" />
                    {text.retryLookup}
                  </button>
                ) : null
              }
            >
              <div className="cob-control">
                <input
                  id="chef-bank-ifsc"
                  aria-label={text.ifsc}
                  className="cob-input cob-mono cob-input--with-trailing-icon"
                  autoComplete="off"
                  autoCapitalize="characters"
                  placeholder={text.ifscExample}
                  maxLength={11}
                  value={ifsc}
                  disabled={busy || confirming}
                  aria-invalid={Boolean(errorFor("ifsc")) || undefined}
                  onChange={(event) => {
                    changed();
                    setIfsc(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
                  }}
                />
                {lookup === "loading" ? (
                  <span className="cob-lock">
                    <Spinner red />
                  </span>
                ) : null}
              </div>
            </FieldShell>
            <LockedInput id="chef-bank-name" label={text.bankName} value={branch?.bankName ?? ""} />
            <LockedInput id="chef-bank-branch" label={text.branch} value={branch?.branchName ?? ""} />
            {branch ? (
              <span role="status" className="sr-only">
                {branch.bankName} · {branch.branchName}
              </span>
            ) : null}
            <div className="cob-field">
              <label className="cob-check">
                <input
                  id="chef-bank-consent"
                  aria-label={text.consentLabel}
                  type="checkbox"
                  checked={consent}
                  disabled={busy || confirming}
                  onChange={(event) => {
                    changed();
                    setConsent(event.target.checked);
                  }}
                />
                <span>{text.consent}</span>
              </label>
              {errorFor("consent") ? <FieldError>{errorFor("consent")}</FieldError> : null}
            </div>
          </div>
        </Card>
      ) : null}

      {confirming ? (
        <div ref={confirmPanel}>
          <Card icon={<Lock size={20} aria-hidden="true" />} title={text.confirmTitle}>
            <dl className="cob-rows">
              <div className="cob-row">
                <dt>{text.holder}</dt>
                <dd>{name}</dd>
              </div>
              <div className="cob-row">
                <dt>{text.number}</dt>
                <dd className="cob-mono">•••• {account.slice(-4)}</dd>
              </div>
              <div className="cob-row">
                <dt>IFSC</dt>
                <dd className="cob-mono">{ifsc}</dd>
              </div>
              <div className="cob-row">
                <dt>{text.bankName}</dt>
                <dd>{branch?.bankName}</dd>
              </div>
              <div className="cob-row">
                <dt>{text.branch}</dt>
                <dd>{branch?.branchName}</dd>
              </div>
            </dl>
            <p className="cob-helper" style={{ marginTop: 14 }}>
              {text.checkCarefully}
            </p>
            <button
              type="button"
              className="cob-secondary"
              style={{ marginTop: 16 }}
              disabled={busy}
              onClick={() => {
                request.current = null;
                setConfirming(false);
                window.setTimeout(() => document.getElementById("chef-bank-account")?.focus(), 0);
              }}
            >
              {text.reenter}
            </button>
          </Card>
        </div>
      ) : null}

      {errorFor("form") ? (
        <Note tone="error" role="alert">
          {errorFor("form")}
        </Note>
      ) : null}
    </form>
  );
}
