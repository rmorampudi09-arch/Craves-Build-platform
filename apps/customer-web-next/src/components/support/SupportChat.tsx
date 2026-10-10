"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AlertCircle, Check, Clock3, RotateCw, SendHorizontal, Sparkles, Ticket } from "lucide-react";
import { sessionFetch } from "@/services/auth/sessionFetch";

type ChatMessage = { role: "user" | "assistant"; content: string };
type Status = "sending" | "sent" | "failed";
type Bubble = ChatMessage & { id: number; at: number; status?: Status; reveal?: boolean };

const MAX_CONTENT = 2000;
const ASSISTANT = "Craves Assistant";
const SUGGESTIONS = {
  CUSTOMER: ["Where is my order?", "How do refunds work?", "How do I change my delivery address?", "How do I start a meal plan?"],
  CHEF: ["How do I accept an order?", "How do I add a dish?", "Where can I see my earnings?", "Is my application approved?"],
};
// Only Craves links, emails and the support phone become clickable; anything else the model writes stays plain text.
const TOKEN = /(https?:\/\/(?:www\.)?craves\.in(?:\/[^\s<>"]*)?|\b[a-z]+@craves\.in\b|\b8367366787\b|"[^"\n]{1,48}")/gi;

/** Oldest-first history the backend accepts: at most 20 turns and inside the BFF's 64 KiB JSON limit. */
export function chatHistory(messages: ChatMessage[]): ChatMessage[] {
  let history = messages.slice(-20).map(message => ({ role: message.role, content: message.content.slice(0, MAX_CONTENT) }));
  while (history.length > 1 && new TextEncoder().encode(JSON.stringify(history)).byteLength > 60_000) history = history.slice(1);
  return history;
}

/** Plain-text reply with Craves links, contacts and "quoted" button names made readable. */
export function richText(text: string): ReactNode[] {
  return text.split(TOKEN).map((part, index) => {
    if (index % 2 === 0) return part.replaceAll(" > ", " › ");
    if (part.startsWith('"')) return <span key={index} className="font-semibold">{part.slice(1, -1)}</span>;
    const link = "font-semibold text-[#B8210F] underline decoration-[#F62E18]/40 underline-offset-2 hover:decoration-[#F62E18]";
    if (part.includes("@")) return <a key={index} href={`mailto:${part}`} className={link}>{part}</a>;
    if (/^\d+$/.test(part)) return <a key={index} href={`tel:${part}`} className={link}>{part}</a>;
    const url = part.replace(/[.,;:!?)]+$/, "");
    // New tab, so following a link never loses the conversation, which lives only on this page.
    return (
      <Fragment key={index}>
        <a href={url} target="_blank" rel="noopener" className={`${link} break-words`}>{url.replace(/^https?:\/\/(www\.)?/, "")}</a>
        {part.slice(url.length)}
      </Fragment>
    );
  });
}

function failure(status: number, retryAfter: string | null, signInPath: string): ReactNode {
  if (status === 429) {
    const seconds = Number(retryAfter);
    return `You're sending messages too quickly. Please slow down and try again in ${Number.isInteger(seconds) && seconds > 0 ? `${seconds} s` : "a moment"}.`;
  }
  if (status === 401) {
    return <>Please <Link href={`/sign-in?returnTo=${encodeURIComponent(signInPath)}`} className="font-semibold underline">sign in</Link> to chat with support.</>;
  }
  if (status === 400) return "That message couldn't be sent. Please shorten it and try again.";
  return <>Assistant unavailable — email <a href="mailto:support@craves.in" className="font-semibold underline">support@craves.in</a> or see <Link href="/contact" className="font-semibold underline">other ways to contact us</Link>.</>;
}

// Only called from send/receive handlers, never while rendering.
const now = () => Date.now();
const clock = (at: number) => new Date(at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

/** Reveals a fresh reply word by word (about a second and a half at most); instant for reduced motion. */
function useReveal(text: string, enabled: boolean, onStep: () => void) {
  const words = text.split(/(\s+)/);
  const [shown, setShown] = useState(enabled ? 0 : words.length);
  useEffect(() => {
    if (!enabled || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      setShown(words.length);
      return;
    }
    const step = Math.max(2, Math.ceil(words.length / 45));
    const timer = window.setInterval(() => setShown(count => {
      if (count + step >= words.length) window.clearInterval(timer);
      return Math.min(words.length, count + step);
    }), 32);
    return () => window.clearInterval(timer);
  }, [enabled, words.length]);
  useEffect(onStep, [shown, onStep]);
  return shown >= words.length ? text : words.slice(0, shown).join("");
}

function AssistantAvatar() {
  return (
    <span aria-hidden="true" className="mb-5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F62E18] text-white shadow-[0_2px_8px_rgba(246,46,24,0.25)]">
      <Sparkles className="h-4 w-4" />
    </span>
  );
}

function AssistantBubble({ message, first, onStep }: { message: Bubble; first: boolean; onStep: () => void }) {
  const text = useReveal(message.content, Boolean(message.reveal), onStep);
  return (
    <li className="craves-chat-in flex items-end gap-2 pr-10">
      {first ? <AssistantAvatar /> : <span className="w-8 shrink-0" aria-hidden="true" />}
      <div className="min-w-0">
        {first ? <p className="mb-1 ml-1 text-xs font-semibold text-[#1A1A1A]">{ASSISTANT}</p> : null}
        <p className="w-fit max-w-full whitespace-pre-wrap rounded-[20px] rounded-bl-md bg-[#F1F3F5] px-4 py-2.5 text-[15px] leading-6 text-[#1A1A1A]">
          {first ? null : <span className="sr-only">{ASSISTANT}: </span>}
          {richText(text)}
        </p>
        <p className="mt-1 ml-1 text-[11px] text-[#6B6B6B]">{clock(message.at)}</p>
      </div>
    </li>
  );
}

function UserBubble({ message, last, onRetry }: { message: Bubble; last: boolean; onRetry: () => void }) {
  return (
    <li className="craves-chat-in flex flex-col items-end pl-12" data-from="user">
      <p className="w-fit max-w-full whitespace-pre-wrap rounded-[20px] rounded-br-md bg-[#DE2A14] px-4 py-2.5 text-[15px] leading-6 text-white">
        <span className="sr-only">You: </span>
        {message.content}
      </p>
      {message.status === "failed" ? (
        <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-[#B8210F]">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" /> Not sent
          <button type="button" onClick={onRetry} className="inline-flex min-h-8 items-center gap-1 rounded-full px-2 font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/30">
            <RotateCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
          </button>
        </p>
      ) : last || message.status === "sending" ? (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-[#6B6B6B]">
          {clock(message.at)}
          {message.status === "sending"
            ? <><Clock3 className="h-3 w-3" aria-hidden="true" /> Sending</>
            : <><Check className="h-3.5 w-3.5 text-[#DE2A14]" aria-hidden="true" /> Sent</>}
        </p>
      ) : null}
    </li>
  );
}

function TypingBubble() {
  return (
    <li className="craves-chat-in flex items-end gap-2" aria-hidden="true">
      <AssistantAvatar />
      <span className="mb-5 flex items-center gap-1 rounded-[20px] rounded-bl-md bg-[#F1F3F5] px-4 py-3.5">
        {[0, 1, 2].map(dot => <span key={dot} className="craves-chat-typing-dot h-2 w-2 rounded-full bg-[#6B6B6B]" />)}
      </span>
    </li>
  );
}

export function SupportChat({ contextRole, orderId }: { contextRole: "CUSTOMER" | "CHEF"; orderId?: string }) {
  const [messages, setMessages] = useState<Bubble[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ReactNode>(null);
  const [caseNumber, setCaseNumber] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [greetedAt] = useState(() => Date.now());
  const listRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nextId = useRef(1);
  const signInPath = `${contextRole === "CHEF" ? "/chef/support" : "/support"}${orderId ? `?orderId=${orderId}` : ""}`;

  const scrollToEnd = useCallback(() => listRef.current?.lastElementChild?.scrollIntoView?.({ block: "end" }), []);
  useEffect(scrollToEnd, [messages.length, pending, scrollToEnd]);

  // The composer grows with the message, up to about five lines.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 132)}px`;
  }, [draft]);

  async function deliver(content: string, earlier: Bubble[]) {
    const id = nextId.current++;
    const outgoing: Bubble = { id, role: "user", content, at: now(), status: "sending" };
    setMessages([...earlier, outgoing]);
    setError(null);
    setPending(true);
    setAnnouncement(`${ASSISTANT} is typing`);
    const settle = (patch: Partial<Bubble>, reply?: Bubble) => setMessages(current => [
      ...current.map(message => message.id === id ? { ...message, ...patch } : message),
      ...(reply ? [reply] : []),
    ]);
    try {
      const response = await sessionFetch("/api/support/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          contextRole,
          orderId,
          messages: chatHistory([...earlier.filter(message => message.status !== "failed"), outgoing]),
        }),
      });
      const body = await response.json().catch(() => null) as { reply?: unknown; supportCase?: { caseNumber?: unknown } | null } | null;
      if (response.ok && typeof body?.reply === "string") {
        settle({ status: "sent" }, { id: nextId.current++, role: "assistant", content: body.reply, at: now(), reveal: true });
        setAnnouncement(`${ASSISTANT}: ${body.reply}`);
        if (typeof body.supportCase?.caseNumber === "string") setCaseNumber(body.supportCase.caseNumber);
      } else {
        settle({ status: "failed" });
        setAnnouncement("Message not sent");
        setError(failure(response.status, response.headers.get("Retry-After"), signInPath));
      }
    } catch {
      settle({ status: "failed" });
      setAnnouncement("Message not sent");
      setError(failure(503, null, signInPath));
    }
    setPending(false);
  }

  function send(text: string, event?: FormEvent) {
    event?.preventDefault();
    const content = text.trim();
    if (!content || pending) return;
    // The send button disables once the draft clears; keep keyboard focus in the composer.
    inputRef.current?.focus();
    setDraft("");
    void deliver(content, messages);
  }

  function retry(failed: Bubble) {
    if (!pending) void deliver(failed.content, messages.filter(message => message.id !== failed.id));
  }

  const greeting: Bubble = {
    id: 0,
    role: "assistant",
    at: greetedAt,
    content: `Hi! I'm the Craves support assistant. Ask me about ${contextRole === "CHEF" ? "your kitchen's orders, your menu or where to find something" : "your orders, payments, or where to find something on Craves"}.`,
  };
  const thread = [greeting, ...messages];
  const lastUser = [...messages].reverse().find(message => message.role === "user")?.id;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="sr-only" aria-live="polite">{announcement}</p>
      <ol ref={listRef} aria-label="Support conversation" className="flex-1 space-y-3 overflow-y-auto overscroll-contain py-4 [scrollbar-color:#E5E7EB_transparent] [scrollbar-width:thin]">
        <li className="pb-1 text-center text-[11px] font-medium tracking-wide text-[#6B6B6B]">Today</li>
        {thread.map((message, index) => message.role === "assistant"
          ? <AssistantBubble key={message.id} message={message} first={thread[index - 1]?.role !== "assistant"} onStep={scrollToEnd} />
          : <UserBubble key={message.id} message={message} last={message.id === lastUser} onRetry={() => retry(message)} />)}
        {pending ? <TypingBubble /> : null}
        {caseNumber ? (
          <li role="status" className="craves-chat-in mx-auto flex w-fit max-w-full items-center gap-2 rounded-full border border-[#F62E18]/25 bg-[#FFF6F4] px-3 py-1.5 text-xs font-semibold text-[#1A1A1A]">
            <Ticket className="h-3.5 w-3.5 shrink-0 text-[#DE2A14]" aria-hidden="true" />
            Ticket {caseNumber} created — our team will reply in your notifications
          </li>
        ) : null}
      </ol>

      {!messages.length ? (
        <div className="flex flex-wrap gap-2 pb-3" aria-label="Suggested questions">
          {SUGGESTIONS[contextRole].map(question => (
            <button
              key={question}
              type="button"
              onClick={() => send(question)}
              className="rounded-full border border-[#E5E7EB] bg-white px-3.5 py-2 text-sm font-medium text-[#1A1A1A] transition-colors hover:border-[#F62E18]/40 hover:bg-[#FFF6F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/30"
            >
              {question}
            </button>
          ))}
        </div>
      ) : null}

      {error ? <p role="alert" className="mb-3 rounded-xl bg-[#FFF1EF] p-3 text-sm text-[#B8210F]">{error}</p> : null}

      <form onSubmit={event => send(draft, event)} className="border-t border-[#E5E7EB] pt-3">
        <div className="flex items-end gap-2 rounded-[24px] border border-[#E5E7EB] bg-white py-1.5 pr-1.5 pl-4 transition-colors focus-within:border-[#F62E18]/50 focus-within:ring-2 focus-within:ring-[#F62E18]/15">
          <label htmlFor="support-chat-input" className="sr-only">Message Craves support</label>
          <textarea
            ref={inputRef}
            id="support-chat-input"
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                send(draft);
              }
            }}
            maxLength={MAX_CONTENT}
            rows={1}
            placeholder="Type your message"
            aria-describedby="support-chat-disclosure"
            className="max-h-[132px] min-h-11 flex-1 resize-none border-0 bg-transparent py-2.5 text-[15px] leading-6 text-[#1A1A1A] caret-[#F62E18] outline-none! placeholder:text-[#6B6B6B]"
          />
          <button
            type="submit"
            disabled={pending || !draft.trim()}
            aria-label="Send message"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#DE2A14] text-white shadow-[0_2px_8px_rgba(222,42,20,0.3)] transition-[transform,background-color,box-shadow] hover:bg-[#C92716] active:scale-95 disabled:bg-[#E5E7EB] disabled:text-[#6B6B6B] disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/40 focus-visible:ring-offset-2"
          >
            <SendHorizontal className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <p id="support-chat-disclosure" className="mt-2 flex justify-between gap-3 px-1 text-xs leading-5 text-[#6B6B6B]">
          <span>You&apos;re chatting with Craves&apos; AI assistant. It can make mistakes. Never share OTPs, card numbers or passwords.</span>
          {draft.length > MAX_CONTENT - 200 ? <span className="shrink-0 tabular-nums">{draft.length}/{MAX_CONTENT}</span> : null}
        </p>
      </form>
    </div>
  );
}
