"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Bike,
  ChevronRight,
  ClipboardList,
  FileText,
  Headset,
  LifeBuoy,
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
import {
  SUPPORT_TOPICS,
  TICKET_STATUS,
  displayPhone,
  isTicketClosed,
  supportPhoneFrom,
  ticketSubject,
  ticketSubtitle,
} from "@/features/chef/lib/chef-support";
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
import { ComingSoon } from "@/shared/ui/feedback/ComingSoon";

type Load = "loading" | "ready" | "error" | "soon";

const TOPIC_ICONS = {
  "Problem with an order": ClipboardList,
  "Payout not received": Wallet,
  "Delivery partner issue": Bike,
  "Update a document": FileText,
};
const CHAT_COMING_SOON = {
  title: "Chat is on its way",
  message:
    "You will be able to write to Craves support here soon. You can call us in the meantime.",
};
const SEND_FAILED = "We couldn't send that. Your message is still here.";

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
  return (
    <button
      type="button"
      className="chef-btn"
      disabled={support.busy}
      aria-busy={support.busy}
      onClick={() => void support.call()}
    >
      <Phone className="h-5 w-5" aria-hidden="true" />
      {support.busy ? "Getting our number…" : "Call"}
    </button>
  );
}

function CallStatus({ dialled }: { dialled: string }) {
  return (
    <p role="status" className="text-center text-[0.875rem] text-[#6B6B6B]">
      {dialled ? `Calling Craves support on ${dialled}` : ""}
    </p>
  );
}

/** Help & support: call or chat with Craves, start a ticket on a common topic, and the chef's own tickets. */
export function ChefSupportHub() {
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
          <h2 className="font-display text-lg font-bold text-[#1A1A1A]">How can we help?</h2>
          <p className="mt-1 text-[0.875rem] text-[#6B6B6B]">Craves support team</p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <CallButton support={support} />
          <Link href="/chef/support/chat" className="chef-btn is-primary">
            <Headset className="h-5 w-5" aria-hidden="true" />
            Chat with us
          </Link>
        </div>
        <div className="mt-3">
          <CallStatus dialled={support.dialled} />
        </div>
      </ChefSection>

      <ChefSection title="Common topics" flush labelledBy="support-topics">
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
                <span className="chef-row-main chef-row-title">{topic}</span>
                <ChevronRight className="chef-chevron h-5 w-5" aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      </ChefSection>

      <ChefSection title="Your tickets" flush labelledBy="support-tickets">
        <div aria-busy={state === "loading"}>
          {state === "loading" ? (
            <div className="grid gap-3 px-4 pb-4" role="status" aria-label="Loading your tickets">
              <ChefSkeleton className="h-12 w-full" />
              <ChefSkeleton className="h-12 w-full" />
            </div>
          ) : state === "soon" ? (
            <div className="px-4 pb-4">
              <ComingSoon
                title="Your tickets are on their way"
                message="Your chats with Craves support will be listed here soon."
              />
            </div>
          ) : state === "error" ? (
            <div className="px-4 pb-4">
              <p role="alert" className="text-[0.9375rem] text-[#1A1A1A]">
                Your tickets didn’t load. Check your connection and try again.
              </p>
              <button
                type="button"
                className="chef-btn mt-3"
                onClick={() => setReload((value) => value + 1)}
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Try again
              </button>
            </div>
          ) : tickets.length === 0 && !cursor ? (
            <ChefEmpty
              icon={LifeBuoy}
              title="No tickets yet"
              text="When you write to Craves support, your chats are listed here."
            />
          ) : (
            <>
              <ul className="chef-list">
                {tickets.map((ticket) => {
                  const status = TICKET_STATUS[ticket.status];
                  return (
                    <li key={ticket.id}>
                      <Link href={`/chef/support/tickets/${ticket.id}`} className="chef-row">
                        <span className="chef-row-main">
                          <span className="chef-row-title block">
                            #{supportCaseNumber(ticket.caseNumber)} · {ticket.subject}
                          </span>
                          <span className="chef-row-meta block">{ticketSubtitle(ticket, now)}</span>
                        </span>
                        <ChefPill tone={status.tone}>{status.label}</ChefPill>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {cursor ? (
                <div className="p-4">
                  <button
                    type="button"
                    className="chef-btn is-block"
                    disabled={loadingMore}
                    aria-busy={loadingMore}
                    onClick={() => void loadMore()}
                  >
                    {loadingMore ? "Loading…" : "Load more"}
                  </button>
                  {moreFailed ? (
                    <p role="alert" className="mt-2 text-[0.875rem] text-[#C4200F]">
                      More tickets didn’t load. Try again.
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
}: {
  caseId?: string;
  topic?: string | null;
  orderId?: string | null;
}) {
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
        // The address becomes the ticket's own, so a reload or a shared link opens it; Back still returns to Help & support.
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

  const status = ticket ? TICKET_STATUS[ticket.status] : null;
  const closed = ticket ? isTicketClosed(ticket.status) : false;
  const showComposer = !closed && (!caseId || ticket);

  return (
    <>
      <ChefPageHead
        title={
          ticket
            ? `#${supportCaseNumber(ticket.caseNumber)}`
            : caseId
              ? "Your ticket"
              : "Chat with us"
        }
        subtitle={ticket ? ticket.subject : (topic ?? undefined)}
        action={status ? <ChefPill tone={status.tone}>{status.label}</ChefPill> : undefined}
        back={{ href: "/chef/support", label: "Help & support" }}
      />
      <div className="chef-stack" aria-busy={state === "loading"}>
        {notPublished || state === "soon" ? (
          <div className="grid gap-3">
            <ComingSoon {...CHAT_COMING_SOON} />
            {draft.trim() ? (
              <p className="text-[0.9375rem] text-[#6B6B6B]">
                Your message is still in the box below.
              </p>
            ) : null}
            <CallButton support={support} />
            <CallStatus dialled={support.dialled} />
          </div>
        ) : state === "loading" ? (
          <div className="grid gap-3" role="status" aria-label="Loading your ticket">
            <ChefSkeleton className="h-16 w-3/4" />
            <ChefSkeleton className="ml-auto h-16 w-3/4" />
          </div>
        ) : state === "error" ? (
          <ChefSection>
            <p role="alert" className="text-[0.9375rem] text-[#1A1A1A]">
              This ticket didn’t load. Check your connection and try again.
            </p>
            <button
              type="button"
              className="chef-btn mt-3"
              onClick={() => setReload((value) => value + 1)}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Try again
            </button>
          </ChefSection>
        ) : ticket ? (
          <ol className="grid gap-3" aria-label="Messages">
            {ticket.messages.map((message) => {
              const mine = message.senderRole !== "SUPPORT";
              return (
                <li
                  key={message.id}
                  className={`max-w-[82%] rounded-2xl px-4 py-3 ${mine ? "justify-self-end rounded-br-md bg-[#E3E6EA]" : "justify-self-start rounded-bl-md border border-[#E5E7EB] bg-white"}`}
                >
                  {mine ? (
                    <span className="sr-only">You:</span>
                  ) : (
                    <p className="text-[0.8125rem] font-bold text-[#1A1A1A]">Craves support</p>
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
            {topic
              ? "Tell us what happened and a Craves support person will reply here."
              : "Ask us anything. A Craves support person will reply here."}
            {topic === "Problem with an order" && !orderId ? " Mention the order number." : ""}
          </p>
        )}

        {closed ? (
          <div className="grid gap-3 text-center">
            <p className="text-[0.9375rem] font-semibold text-[#6B6B6B]">This ticket is closed</p>
            <Link href="/chef/support/new" className="chef-btn">
              Start a new chat
            </Link>
          </div>
        ) : null}

        {showComposer ? (
          <form onSubmit={(event) => void send(event)} className="grid gap-2">
            <label htmlFor="support-message" className="chef-field-label">
              {ticket ? "Write a reply" : "Write your message"}
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
                {SEND_FAILED}
              </p>
            ) : null}
            <button
              type="submit"
              className="chef-btn is-primary justify-self-end"
              disabled={!draft.trim() || sending || notPublished}
              aria-busy={sending}
            >
              <SendHorizontal className="h-5 w-5" aria-hidden="true" />
              {sending ? "Sending…" : "Send"}
            </button>
          </form>
        ) : null}
        <div ref={end} />
      </div>
    </>
  );
}
