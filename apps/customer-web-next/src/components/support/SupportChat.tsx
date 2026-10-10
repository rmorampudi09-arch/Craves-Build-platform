"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { SendHorizontal, Ticket } from "lucide-react";
import { Button } from "@/components/ui/buttons/button";
import { Textarea } from "@/components/ui/forms/textarea";
import { sessionFetch } from "@/services/auth/sessionFetch";

type ChatMessage = { role: "user" | "assistant"; content: string };

const MAX_CONTENT = 2000;

/** Oldest-first history the backend accepts: at most 20 turns and inside the BFF's 64 KiB JSON limit. */
export function chatHistory(messages: ChatMessage[]): ChatMessage[] {
  let history = messages.slice(-20).map(message => ({ ...message, content: message.content.slice(0, MAX_CONTENT) }));
  while (history.length > 1 && new TextEncoder().encode(JSON.stringify(history)).byteLength > 60_000) history = history.slice(1);
  return history;
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

export function SupportChat({ contextRole, orderId }: { contextRole: "CUSTOMER" | "CHEF"; orderId?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ReactNode>(null);
  const [caseNumber, setCaseNumber] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const signInPath = `${contextRole === "CHEF" ? "/chef/support" : "/support"}${orderId ? `?orderId=${orderId}` : ""}`;

  useEffect(() => {
    if (messages.length) endRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [messages, pending]);

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const content = draft.trim();
    if (!content || pending) return;
    // The send button disables once the draft clears; keep keyboard focus in the composer.
    inputRef.current?.focus();
    const sent: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(sent);
    setDraft("");
    setError(null);
    setPending(true);
    let reply: string | null = null;
    try {
      const response = await sessionFetch("/api/support/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ contextRole, orderId, messages: chatHistory(sent) }),
      });
      const body = await response.json().catch(() => null) as { reply?: unknown; supportCase?: { caseNumber?: unknown } | null } | null;
      if (response.ok && typeof body?.reply === "string") {
        reply = body.reply;
        if (typeof body.supportCase?.caseNumber === "string") setCaseNumber(body.supportCase.caseNumber);
      } else {
        setError(failure(response.status, response.headers.get("Retry-After"), signInPath));
      }
    } catch {
      setError(failure(503, null, signInPath));
    }
    // A failed turn is removed and its text restored, so a retry never sends two user turns in a row.
    if (reply === null) {
      setMessages(messages);
      setDraft(content);
    } else {
      setMessages([...sent, { role: "assistant", content: reply }]);
    }
    setPending(false);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="log" aria-live="polite" aria-label="Support conversation" className="flex-1 space-y-3 overflow-y-auto py-4">
        <p className="mr-10 w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-[#F1F3F5] px-4 py-3 text-sm text-[#1A1A1A]">
          Hi! I&apos;m the Craves support assistant. Ask me about {contextRole === "CHEF" ? "your kitchen's orders or your account" : "your orders, payments or account"}.
        </p>
        {messages.map((message, index) => (
          <p
            key={index}
            className={message.role === "user"
              ? "ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-[#F62E18]/10 px-4 py-3 text-sm text-[#1A1A1A]"
              : "mr-10 w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-[#F1F3F5] px-4 py-3 text-sm text-[#1A1A1A]"}
          >
            <span className="sr-only">{message.role === "user" ? "You: " : "Assistant: "}</span>
            {message.content}
          </p>
        ))}
        {pending ? <p className="text-sm text-[#6B6B6B]">Craves assistant is typing…</p> : null}
        <div ref={endRef} />
      </div>

      {caseNumber ? (
        <p role="status" className="mb-3 inline-flex w-fit items-center gap-2 rounded-full border border-[#F62E18]/30 bg-white px-3 py-1.5 text-xs font-semibold text-[#1A1A1A]">
          <Ticket className="h-3.5 w-3.5 text-[#F62E18]" aria-hidden="true" />
          Ticket {caseNumber} created — our team will reply in your notifications
        </p>
      ) : null}
      {error ? <p role="alert" className="mb-3 rounded-xl bg-[#FFF1EF] p-3 text-sm text-[#C92716]">{error}</p> : null}

      <form onSubmit={send} className="border-t border-[#E5E7EB] pt-3">
        <p id="support-chat-disclosure" className="mb-2 text-xs leading-5 text-[#6B6B6B]">
          You&apos;re chatting with Craves&apos; AI assistant. It can make mistakes. Never share OTPs, card numbers or passwords.
        </p>
        <div className="flex items-end gap-2">
          <label htmlFor="support-chat-input" className="sr-only">Message Craves support</label>
          <Textarea
            ref={inputRef}
            id="support-chat-input"
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send();
              }
            }}
            maxLength={MAX_CONTENT}
            rows={2}
            placeholder="Type your message"
            aria-describedby="support-chat-disclosure"
            className="max-h-40 resize-none rounded-2xl border-[#E5E7EB] bg-white focus-visible:ring-2 focus-visible:ring-[#F62E18]/30"
          />
          <Button type="submit" size="icon" disabled={pending || !draft.trim()} aria-label="Send message" className="shrink-0 rounded-full bg-[#F62E18] text-white hover:bg-[#F62E18]/90">
            <SendHorizontal aria-hidden="true" />
          </Button>
        </div>
      </form>
    </div>
  );
}
