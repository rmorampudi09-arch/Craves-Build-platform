"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Bike,
  ChevronRight,
  ClipboardList,
  FileText,
  Headset,
  Phone,
  RefreshCw,
  SendHorizontal,
  Wallet,
} from "lucide-react";
import {
  ChefEmpty,
  ChefPageHead,
  ChefPill,
  ChefSection,
  ChefSkeleton,
  dateTime,
} from "@/features/chef/components/chef-ui";
import { pageText } from "@/features/chef/lib/chef-page-text";
import {
  SUPPORT_TOPICS,
  displayPhone,
  isTicketClosed,
  supportPhoneFrom,
  ticketBack,
  ticketStatus,
  ticketSubject,
  ticketSubtitle,
  topicLabel,
} from "@/features/chef/lib/chef-support";
import { format, messages } from "@/shared/i18n/language";
import { useLanguage, useText } from "@/shared/i18n/language-context";
import { FEATURE_NOT_AVAILABLE } from "@/shared/lib/feature-availability";
import { supportCaseNumber } from "@/shared/lib/order-number";
import { sessionFetch } from "@/shared/lib/session-fetch";
import {
  createSupportCase,
  getSupportCase,
  listSupportCases,
  replyToSupportCase,
  SupportCaseError,
} from "@/shared/lib/support-cases-client";
import {
  SUPPORT_MESSAGE_MAX,
  type SupportCase,
  type SupportCaseSummary,
} from "@/shared/lib/support-cases-contract";

type Load = "loading" | "ready" | "error" | "soon";

const TOPIC_ICONS = {
  "Problem with an order": ClipboardList,
  "Payout not received": Wallet,
  "Delivery partner issue": Bike,
  "Update a document": FileText,
};
const TEXT = messages({
  en: {
    chatSoonTitle: "Chat is on its way", chatSoonText: "You will be able to write to Craves support here soon. You can call us in the meantime.",
    sendFailed: "We couldn't send that. Your message is still here.", gettingNumber: "Getting our number…", call: "Call",
    calling: "Calling Craves support on {phone}", howHelp: "How can we help?", team: "Craves support team", chat: "Chat with us",
    topics: "Common topics", tickets: "Your tickets", loadingTickets: "Loading your tickets",
    ticketsSoonTitle: "Your tickets are on their way", ticketsSoonText: "Your chats with Craves support will be listed here soon.",
    ticketsFailed: "Your tickets didn’t load. Check your connection and try again.", tryAgain: "Try again",
    noTickets: "No tickets yet", noTicketsText: "When you write to Craves support, your chats are listed here.",
    loading: "Loading…", loadMore: "Load more", moreFailed: "More tickets didn’t load. Try again.",
    yourTicket: "Your ticket", stillInBox: "Your message is still in the box below.", loadingTicket: "Loading your ticket",
    ticketFailed: "This ticket didn’t load. Check your connection and try again.", messages: "Messages", you: "You:",
    support: "Craves support", tellUs: "Tell us what happened and a Craves support person will reply here.",
    askUs: "Ask us anything. A Craves support person will reply here.", orderNumber: " Mention the order number.",
    closed: "This ticket is closed", newChat: "Start a new chat", reply: "Write a reply", message: "Write your message",
    sending: "Sending…", send: "Send",
  },
  te: {
    chatSoonTitle: "చాట్ త్వరలో వస్తుంది", chatSoonText: "త్వరలో ఇక్కడ Craves సహాయ బృందానికి రాయవచ్చు. అప్పటి వరకు మాకు కాల్ చేయండి.",
    sendFailed: "అది పంపలేకపోయాం. మీ సందేశం ఇక్కడే ఉంది.", gettingNumber: "మా నంబర్ తీసుకుంటున్నాం…", call: "కాల్ చేయండి",
    calling: "{phone} నంబర్‌లో Craves సహాయ బృందానికి కాల్ చేస్తోంది", howHelp: "మేము ఎలా సహాయం చేయగలం?", team: "Craves సహాయ బృందం", chat: "మాతో చాట్ చేయండి",
    topics: "సాధారణ సమస్యలు", tickets: "మీ టికెట్లు", loadingTickets: "మీ టికెట్లు లోడ్ అవుతున్నాయి",
    ticketsSoonTitle: "మీ టికెట్లు త్వరలో వస్తాయి", ticketsSoonText: "Craves సహాయ బృందంతో మీ చాట్‌లు త్వరలో ఇక్కడ కనిపిస్తాయి.",
    ticketsFailed: "మీ టికెట్లు లోడ్ కాలేదు. ఇంటర్నెట్ చూసుకుని మళ్లీ ప్రయత్నించండి.", tryAgain: "మళ్లీ ప్రయత్నించండి",
    noTickets: "ఇంకా టికెట్లు లేవు", noTicketsText: "మీరు Craves సహాయ బృందానికి రాసినప్పుడు, మీ చాట్‌లు ఇక్కడ కనిపిస్తాయి.",
    loading: "లోడ్ అవుతోంది…", loadMore: "ఇంకా చూపించండి", moreFailed: "మరిన్ని టికెట్లు లోడ్ కాలేదు. మళ్లీ ప్రయత్నించండి.",
    yourTicket: "మీ టికెట్", stillInBox: "మీ సందేశం కింద బాక్స్‌లోనే ఉంది.", loadingTicket: "మీ టికెట్ లోడ్ అవుతోంది",
    ticketFailed: "ఈ టికెట్ లోడ్ కాలేదు. ఇంటర్నెట్ చూసుకుని మళ్లీ ప్రయత్నించండి.", messages: "సందేశాలు", you: "మీరు:",
    support: "Craves సహాయ బృందం", tellUs: "ఏమి జరిగిందో చెప్పండి, Craves సహాయ బృందం నుండి ఒకరు ఇక్కడ జవాబు ఇస్తారు.",
    askUs: "ఏదైనా అడగండి. Craves సహాయ బృందం నుండి ఒకరు ఇక్కడ జవాబు ఇస్తారు.", orderNumber: " ఆర్డర్ నంబర్ కూడా రాయండి.",
    closed: "ఈ టికెట్ మూసివేశారు", newChat: "కొత్త చాట్ మొదలుపెట్టండి", reply: "జవాబు రాయండి", message: "మీ సందేశం రాయండి",
    sending: "పంపుతోంది…", send: "పంపండి",
  },
  kn: {
    chatSoonTitle: "ಚಾಟ್ ಶೀಘ್ರದಲ್ಲೇ ಬರಲಿದೆ", chatSoonText: "ಶೀಘ್ರದಲ್ಲೇ ಇಲ್ಲಿ Craves ಸಹಾಯ ತಂಡಕ್ಕೆ ಬರೆಯಬಹುದು. ಅಲ್ಲಿಯವರೆಗೆ ನಮಗೆ ಕರೆ ಮಾಡಿ.",
    sendFailed: "ಅದನ್ನು ಕಳುಹಿಸಲು ಆಗಲಿಲ್ಲ. ನಿಮ್ಮ ಸಂದೇಶ ಇಲ್ಲೇ ಇದೆ.", gettingNumber: "ನಮ್ಮ ಸಂಖ್ಯೆ ಪಡೆಯುತ್ತಿದ್ದೇವೆ…", call: "ಕರೆ ಮಾಡಿ",
    calling: "{phone} ಸಂಖ್ಯೆಯಲ್ಲಿ Craves ಸಹಾಯ ತಂಡಕ್ಕೆ ಕರೆ ಮಾಡಲಾಗುತ್ತಿದೆ", howHelp: "ನಾವು ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು?", team: "Craves ಸಹಾಯ ತಂಡ", chat: "ನಮ್ಮೊಂದಿಗೆ ಚಾಟ್ ಮಾಡಿ",
    topics: "ಸಾಮಾನ್ಯ ವಿಷಯಗಳು", tickets: "ನಿಮ್ಮ ಟಿಕೆಟ್‌ಗಳು", loadingTickets: "ನಿಮ್ಮ ಟಿಕೆಟ್‌ಗಳು ಲೋಡ್ ಆಗುತ್ತಿವೆ",
    ticketsSoonTitle: "ನಿಮ್ಮ ಟಿಕೆಟ್‌ಗಳು ಶೀಘ್ರದಲ್ಲೇ ಬರಲಿವೆ", ticketsSoonText: "Craves ಸಹಾಯ ತಂಡದೊಂದಿಗಿನ ನಿಮ್ಮ ಚಾಟ್‌ಗಳು ಶೀಘ್ರದಲ್ಲೇ ಇಲ್ಲಿ ಕಾಣುತ್ತವೆ.",
    ticketsFailed: "ನಿಮ್ಮ ಟಿಕೆಟ್‌ಗಳು ಲೋಡ್ ಆಗಲಿಲ್ಲ. ಇಂಟರ್ನೆಟ್ ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.", tryAgain: "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ",
    noTickets: "ಇನ್ನೂ ಟಿಕೆಟ್‌ಗಳಿಲ್ಲ", noTicketsText: "ನೀವು Craves ಸಹಾಯ ತಂಡಕ್ಕೆ ಬರೆದಾಗ, ನಿಮ್ಮ ಚಾಟ್‌ಗಳು ಇಲ್ಲಿ ಕಾಣುತ್ತವೆ.",
    loading: "ಲೋಡ್ ಆಗುತ್ತಿದೆ…", loadMore: "ಇನ್ನಷ್ಟು ತೋರಿಸಿ", moreFailed: "ಇನ್ನಷ್ಟು ಟಿಕೆಟ್‌ಗಳು ಲೋಡ್ ಆಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    yourTicket: "ನಿಮ್ಮ ಟಿಕೆಟ್", stillInBox: "ನಿಮ್ಮ ಸಂದೇಶ ಕೆಳಗಿನ ಬಾಕ್ಸ್‌ನಲ್ಲೇ ಇದೆ.", loadingTicket: "ನಿಮ್ಮ ಟಿಕೆಟ್ ಲೋಡ್ ಆಗುತ್ತಿದೆ",
    ticketFailed: "ಈ ಟಿಕೆಟ್ ಲೋಡ್ ಆಗಲಿಲ್ಲ. ಇಂಟರ್ನೆಟ್ ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.", messages: "ಸಂದೇಶಗಳು", you: "ನೀವು:",
    support: "Craves ಸಹಾಯ ತಂಡ", tellUs: "ಏನಾಯಿತು ಎಂದು ತಿಳಿಸಿ, Craves ಸಹಾಯ ತಂಡದ ಒಬ್ಬರು ಇಲ್ಲಿ ಉತ್ತರಿಸುತ್ತಾರೆ.",
    askUs: "ಏನು ಬೇಕಾದರೂ ಕೇಳಿ. Craves ಸಹಾಯ ತಂಡದ ಒಬ್ಬರು ಇಲ್ಲಿ ಉತ್ತರಿಸುತ್ತಾರೆ.", orderNumber: " ಆರ್ಡರ್ ಸಂಖ್ಯೆಯನ್ನೂ ಬರೆಯಿರಿ.",
    closed: "ಈ ಟಿಕೆಟ್ ಮುಚ್ಚಲಾಗಿದೆ", newChat: "ಹೊಸ ಚಾಟ್ ಶುರುಮಾಡಿ", reply: "ಉತ್ತರ ಬರೆಯಿರಿ", message: "ನಿಮ್ಮ ಸಂದೇಶ ಬರೆಯಿರಿ",
    sending: "ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ…", send: "ಕಳುಹಿಸಿ",
  },
});

const comingSoon = (error: unknown) =>
  error instanceof SupportCaseError && error.code === FEATURE_NOT_AVAILABLE;
const isChefTicket = (ticket: SupportCaseSummary) => ticket.requesterRole === "CHEF";

/** Call reads the support number again on every tap, and dials today's number when that read fails. */
function useSupportCall() {
  const [busy, setBusy] = useState(false);
  const [dialled, setDialled] = useState("");
  async function call() {
    if (busy) return;
    setBusy(true);
    const response = await sessionFetch("/api/chef/onboarding", { cache: "no-store" }).catch(
      () => null,
    );
    const phone = supportPhoneFrom(response?.ok ? await response.json().catch(() => null) : null);
    setBusy(false);
    // A computer without a phone app does nothing with tel:, so the number is also written out.
    setDialled(displayPhone(phone));
    window.location.assign(`tel:${phone}`);
  }
  return { busy, dialled, call };
}

function CallButton({ support }: { support: ReturnType<typeof useSupportCall> }) {
  const text = useText(TEXT);
  return (
    <button
      type="button"
      className="chef-btn"
      disabled={support.busy}
      aria-busy={support.busy}
      onClick={() => void support.call()}
    >
      <Phone className="h-5 w-5" aria-hidden="true" />
      {support.busy ? text.gettingNumber : text.call}
    </button>
  );
}

function CallStatus({ dialled }: { dialled: string }) {
  const text = useText(TEXT);
  return (
    <p role="status" className="text-center text-[0.875rem] text-[#6B6B6B]">
      {dialled ? format(text.calling, { phone: dialled }) : ""}
    </p>
  );
}

/** Help & support: call or chat with Craves, start a ticket on a common topic, and the chef's own tickets. */
export function ChefSupportHub() {
  const text = useText(TEXT);
  const { language } = useLanguage();
  const support = useSupportCall();
  const [tickets, setTickets] = useState<SupportCaseSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<Load>("loading");
  const [now, setNow] = useState(() => new Date());
  const [reload, setReload] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setState("loading");
    listSupportCases()
      .then((page) => {
        if (!active) return;
        setTickets(page.items.filter(isChefTicket));
        setCursor(page.nextCursor);
        setNow(new Date());
        setState("ready");
      })
      .catch((error: unknown) => {
        if (active) setState(comingSoon(error) ? "soon" : "error");
      });
    return () => {
      active = false;
    };
  }, [reload]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const page = await listSupportCases(cursor);
      // A ticket that moved up between pages is listed once.
      setTickets((current) => [
        ...current,
        ...page.items.filter(
          (item) => isChefTicket(item) && !current.some((ticket) => ticket.id === item.id),
        ),
      ]);
      setCursor(page.nextCursor);
    } catch {
      setMoreFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="chef-stack">
      <ChefSection>
        <div className="text-center">
          <h2 className="font-display text-lg font-bold text-[#1A1A1A]">{text.howHelp}</h2>
          <p className="mt-1 text-[0.875rem] text-[#6B6B6B]">{text.team}</p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <CallButton support={support} />
          <Link href="/chef/support/chat" className="chef-btn is-primary">
            <Headset className="h-5 w-5" aria-hidden="true" />
            {text.chat}
          </Link>
        </div>
        <div className="mt-3">
          <CallStatus dialled={support.dialled} />
        </div>
      </ChefSection>

      <ChefSection title={text.topics} flush labelledBy="support-topics">
        <div className="chef-list">
          {SUPPORT_TOPICS.map((topic) => {
            const Icon = TOPIC_ICONS[topic];
            return (
              <Link
                key={topic}
                href={`/chef/support/new?topic=${encodeURIComponent(topic)}`}
                className="chef-row"
              >
                <span className="chef-row-icon">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="chef-row-main chef-row-title">{topicLabel(topic, language)}</span>
                <ChevronRight className="chef-chevron h-5 w-5" aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      </ChefSection>

      <ChefSection title={text.tickets} flush labelledBy="support-tickets">
        <div aria-busy={state === "loading"}>
          {state === "loading" ? (
            <div className="grid gap-3 px-4 pb-4" role="status" aria-label={text.loadingTickets}>
              <ChefSkeleton className="h-12 w-full" />
              <ChefSkeleton className="h-12 w-full" />
            </div>
          ) : state === "soon" ? (
            <ChefEmpty illustration="comingSoon" title={text.ticketsSoonTitle} text={text.ticketsSoonText} />
          ) : state === "error" ? (
            <div className="px-4 pb-4">
              <p role="alert" className="text-[0.9375rem] text-[#1A1A1A]">
                {text.ticketsFailed}
              </p>
              <button
                type="button"
                className="chef-btn mt-3"
                onClick={() => setReload((value) => value + 1)}
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                {text.tryAgain}
              </button>
            </div>
          ) : (
            <>
              {tickets.length === 0 ? (
                <ChefEmpty illustration="support" title={text.noTickets} text={text.noTicketsText} />
              ) : (
                <ul className="chef-list">
                  {tickets.map((ticket) => {
                    const status = ticketStatus(ticket.status, language);
                    return (
                      <li key={ticket.id}>
                        <Link href={`/chef/support/tickets/${ticket.id}`} className="chef-row">
                          <span className="chef-row-main">
                            <span className="chef-row-title block">
                              #{supportCaseNumber(ticket.caseNumber)} · {topicLabel(ticket.subject, language)}
                            </span>
                            <span className="chef-row-meta block">
                              {ticketSubtitle(ticket, now, language)}
                            </span>
                          </span>
                          <ChefPill tone={status.tone}>{status.label}</ChefPill>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
              {cursor ? (
                <div className="p-4">
                  <button
                    type="button"
                    className="chef-btn is-block"
                    disabled={loadingMore}
                    aria-busy={loadingMore}
                    onClick={() => void loadMore()}
                  >
                    {loadingMore ? text.loading : text.loadMore}
                  </button>
                  {moreFailed ? (
                    <p role="alert" className="mt-2 text-[0.875rem] text-[#C4200F]">
                      {text.moreFailed}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      </ChefSection>
    </div>
  );
}

/** One support conversation, or a new one when there is no ticket yet: the first message opens the ticket. */
export function ChefSupportTicket({
  caseId,
  topic = null,
  orderId = null,
  from = null,
}: {
  caseId?: string;
  topic?: string | null;
  orderId?: string | null;
  from?: string | null;
}) {
  const text = useText(TEXT);
  const { language } = useLanguage();
  const support = useSupportCall();
  const [ticket, setTicket] = useState<SupportCase | null>(null);
  const [state, setState] = useState<Load>(caseId ? "loading" : "ready");
  const [reload, setReload] = useState(0);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const [notPublished, setNotPublished] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const messageCount = ticket?.messages.length ?? 0;

  useEffect(() => {
    if (!caseId) return;
    let active = true;
    setState("loading");
    getSupportCase(caseId)
      .then((found) => {
        if (!active) return;
        // The same person's customer tickets are not opened here, as in the app.
        if (!isChefTicket(found)) return setState("error");
        setTicket(found);
        setState("ready");
      })
      .catch((error: unknown) => {
        if (active) setState(comingSoon(error) ? "soon" : "error");
      });
    return () => {
      active = false;
    };
  }, [caseId, reload]);

  // The newest message is the one to read, as in any chat.
  useEffect(() => {
    if (messageCount) end.current?.scrollIntoView?.({ block: "nearest" });
  }, [messageCount]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || sending) return;
    setSending(true);
    setSendFailed(false);
    try {
      if (ticket) {
        setTicket(await replyToSupportCase(ticket.id, message));
      } else {
        const created = await createSupportCase({
          contextRole: "CHEF",
          orderId,
          subject: ticketSubject(topic, orderId),
          message,
        });
        setTicket(created);
        // The address becomes the ticket's own, so a reload or a shared link opens it.
        window.history.replaceState(null, "", `/chef/support/tickets/${created.id}`);
      }
      setDraft("");
    } catch (error) {
      if (comingSoon(error)) setNotPublished(true);
      else setSendFailed(true);
    } finally {
      setSending(false);
    }
  }

  const status = ticket ? ticketStatus(ticket.status, language) : null;
  const closed = ticket ? isTicketClosed(ticket.status) : false;
  const showComposer = !closed && (!caseId || ticket);
  const back = ticketBack(from);

  return (
    <>
      <ChefPageHead
        title={
          ticket
            ? `#${supportCaseNumber(ticket.caseNumber)}`
            : caseId
              ? text.yourTicket
              : text.chat
        }
        subtitle={ticket ? topicLabel(ticket.subject, language) : topic ? topicLabel(topic, language) : undefined}
        action={status ? <ChefPill tone={status.tone}>{status.label}</ChefPill> : undefined}
        back={{ href: back.href, label: pageText(back.label, language) }}
      />
      <div className="chef-stack" aria-busy={state === "loading"}>
        {notPublished || state === "soon" ? (
          <div className="grid gap-3">
            <ChefSection>
              <ChefEmpty illustration="comingSoon" title={text.chatSoonTitle} text={text.chatSoonText} />
            </ChefSection>
            {draft.trim() ? (
              <p className="text-[0.9375rem] text-[#6B6B6B]">{text.stillInBox}</p>
            ) : null}
            <CallButton support={support} />
            <CallStatus dialled={support.dialled} />
          </div>
        ) : state === "loading" ? (
          <div className="grid gap-3" role="status" aria-label={text.loadingTicket}>
            <ChefSkeleton className="h-16 w-3/4" />
            <ChefSkeleton className="ml-auto h-16 w-3/4" />
          </div>
        ) : state === "error" ? (
          <ChefSection>
            <p role="alert" className="text-[0.9375rem] text-[#1A1A1A]">
              {text.ticketFailed}
            </p>
            <button
              type="button"
              className="chef-btn mt-3"
              onClick={() => setReload((value) => value + 1)}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {text.tryAgain}
            </button>
          </ChefSection>
        ) : ticket ? (
          <ol className="grid gap-3" aria-label={text.messages}>
            {ticket.messages.map((message) => {
              const mine = message.senderRole !== "SUPPORT";
              return (
                <li
                  key={message.id}
                  className={`max-w-[82%] rounded-2xl px-4 py-3 ${mine ? "justify-self-end rounded-br-md bg-[#E3E6EA]" : "justify-self-start rounded-bl-md border border-[#E5E7EB] bg-white"}`}
                >
                  {mine ? (
                    <span className="sr-only">{text.you}</span>
                  ) : (
                    <p className="text-[0.8125rem] font-bold text-[#1A1A1A]">{text.support}</p>
                  )}
                  <p className="whitespace-pre-wrap break-words text-[0.9375rem] leading-6 text-[#1A1A1A]">
                    {message.body}
                  </p>
                  <p className={`mt-1 text-xs text-[#6B6B6B] ${mine ? "text-right" : ""}`}>
                    {dateTime(message.createdAt)}
                  </p>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-[0.9375rem] leading-6 text-[#6B6B6B]">
            {topic ? text.tellUs : text.askUs}
            {topic === "Problem with an order" && !orderId ? text.orderNumber : ""}
          </p>
        )}

        {closed ? (
          <div className="grid gap-3 text-center">
            <p className="text-[0.9375rem] font-semibold text-[#6B6B6B]">{text.closed}</p>
            <Link href="/chef/support/new" className="chef-btn">
              {text.newChat}
            </Link>
          </div>
        ) : null}

        {showComposer ? (
          <form onSubmit={(event) => void send(event)} className="grid gap-2">
            <label htmlFor="support-message" className="chef-field-label">
              {ticket ? text.reply : text.message}
            </label>
            <textarea
              id="support-message"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={SUPPORT_MESSAGE_MAX}
              rows={3}
              readOnly={sending}
              className="w-full rounded-xl border border-[#E5E7EB] bg-white px-4 py-3 text-base text-[#1A1A1A] outline-none transition focus:border-[#F62E18] focus:ring-2 focus:ring-[#1A1A1A]/10"
            />
            {sendFailed ? (
              <p role="alert" className="text-[0.875rem] font-medium text-[#C4200F]">
                {text.sendFailed}
              </p>
            ) : null}
            <button
              type="submit"
              className="chef-btn is-primary justify-self-end"
              disabled={!draft.trim() || sending || notPublished}
              aria-busy={sending}
            >
              <SendHorizontal className="h-5 w-5" aria-hidden="true" />
              {sending ? text.sending : text.send}
            </button>
          </form>
        ) : null}
        <div ref={end} />
      </div>
    </>
  );
}
