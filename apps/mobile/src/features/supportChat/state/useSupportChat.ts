import {useEffect, useRef, useState} from 'react';
import {AccessibilityInfo} from 'react-native';
import {toAppApiError} from '../../../core/http/apiError';
import {isRouteNotPublished} from '../../../core/http/routeAvailability';
import {shortCaseNumber} from '../../chefShell/domain/chefFormat';
import {
  supportChatApi,
  type SupportChatContextRole,
  type SupportChatMessage,
} from '../api/supportChatApi';

export type ChatStatus = 'sending' | 'sent' | 'failed';
export type ChatBubble = SupportChatMessage & {
  id: number;
  at: number;
  status?: ChatStatus;
  reveal?: boolean;
};
export interface SupportCaseRef {
  id: string;
  caseNumber: string;
}
export interface ChatProblem {
  message: string;
  /** The assistant cannot be reached at all (503 or a route the gateway has not published): offer a phone or email instead. */
  unavailable: boolean;
}

// A 429 from the gateway itself carries no chat code; wait this long when it also carries no Retry-After.
const DEFAULT_WAIT_SECONDS = 30;
// The shared parser clamps Retry-After to an hour and drops anything it cannot read (a day is 5 digits).
const MAX_PARSED_WAIT_SECONDS = 3600;
const CHAT_LIMIT_CODE = 'SUPPORT_CHAT_RATE_LIMITED';

/** The chef sees the short ticket number every other chef screen shows (#01042), not the long case number. */
export function ticketCopy(contextRole: SupportChatContextRole, caseNumber: string): string {
  return contextRole === 'CHEF'
    ? `Ticket ${shortCaseNumber(caseNumber)} created`
    : `Ticket ${caseNumber} created — our team will reply in your notifications`;
}

/**
 * One support conversation. History lives in memory only (it can hold order and account details); each Send makes one
 * request with the whole history, and a message that fails stays in the thread as "Not sent" with Retry.
 */
export function useSupportChat(
  contextRole: SupportChatContextRole,
  orderId: string | undefined,
) {
  const nextId = useRef(1);
  const busy = useRef(false);
  const waitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [messages, setMessages] = useState<ChatBubble[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  // A 429 turns Send off until its Retry-After has passed.
  const [waiting, setWaiting] = useState(false);
  const [problem, setProblem] = useState<ChatProblem | null>(null);
  const [supportCase, setSupportCase] = useState<SupportCaseRef | null>(null);

  useEffect(() => () => clearTimeout(waitTimer.current), []);

  const deliver = async (content: string, earlier: ChatBubble[]) => {
    const id = nextId.current++;
    const outgoing: ChatBubble = {id, role: 'user', content, at: Date.now(), status: 'sending'};
    const settle = (status: ChatStatus, reply?: ChatBubble) =>
      setMessages(current => [
        ...current.map(message => (message.id === id ? {...message, status} : message)),
        ...(reply ? [reply] : []),
      ]);
    busy.current = true;
    setMessages([...earlier, outgoing]);
    setProblem(null);
    setPending(true);
    try {
      const {reply, supportCase: raised} = await supportChatApi.send(
        contextRole,
        [...earlier.filter(message => message.status !== 'failed'), outgoing].map(({role, content: text}) => ({
          role,
          content: text,
        })),
        orderId,
      );
      settle('sent', {id: nextId.current++, role: 'assistant', content: reply, at: Date.now(), reveal: true});
      if (raised) {
        setSupportCase(raised);
      }
      AccessibilityInfo.announceForAccessibility(raised ? `${reply} ${ticketCopy(contextRole, raised.caseNumber)}` : reply);
    } catch (caught) {
      const error = toAppApiError(caught);
      const chatLimit = error.code === CHAT_LIMIT_CODE;
      settle('failed');
      setProblem({
        // Only the chat's own limit shows the server's wording ("today's chat limit... email support"); other 429s stay generic.
        message: (chatLimit && error.backendMessage) || error.message,
        unavailable: error.status === 503 || isRouteNotPublished(error),
      });
      if (error.status === 429) {
        setWaiting(true);
        clearTimeout(waitTimer.current);
        // The daily cap sends a wait the parser cannot read or clamps to its ceiling: Send stays off for this visit.
        const restOfVisit = chatLimit && (error.retryAfterSeconds === undefined || error.retryAfterSeconds >= MAX_PARSED_WAIT_SECONDS);
        if (!restOfVisit) {
          waitTimer.current = setTimeout(() => {
            setWaiting(false);
            setProblem(null);
          }, (error.retryAfterSeconds ?? DEFAULT_WAIT_SECONDS) * 1000);
        }
      }
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  const submit = (text: string, fromDraft: boolean) => {
    const content = text.trim();
    if (!content || busy.current || waiting) {
      return;
    }
    // A suggestion leaves a half-typed message alone; only the draft that was sent is cleared.
    if (fromDraft) {
      setDraft('');
    }
    deliver(content, messages).catch(() => undefined);
  };
  /** A suggested question. */
  const send = (text: string) => submit(text, false);
  /** The Send button: sends what is typed and empties the box. */
  const sendDraft = () => submit(draft, true);

  const retry = (failed: ChatBubble) => {
    if (!busy.current && !waiting) {
      deliver(failed.content, messages.filter(message => message.id !== failed.id)).catch(() => undefined);
    }
  };

  return {messages, draft, setDraft, pending, waiting, problem, supportCase, send, sendDraft, retry};
}
