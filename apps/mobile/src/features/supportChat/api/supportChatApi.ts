import {z} from 'zod';
import {AppApiError} from '../../../core/http/apiError';
import {httpClient} from '../../../core/http/httpClient';

export const SUPPORT_CHAT_PATH = '/api/v1/support/chat';
export const SUPPORT_CHAT_MAX_MESSAGES = 20;
export const SUPPORT_CHAT_MAX_CONTENT_LENGTH = 2000;
// The backend only reads the newest ~8000 characters; sending no more keeps Telugu/Hindi chats under the gateway's 64 KB cap.
export const SUPPORT_CHAT_MAX_HISTORY_CHARS = 8000;
// Assistant replies are model-generated and slower than ordinary writes.
const SUPPORT_CHAT_TIMEOUT_MS = 45_000;

function recentHistory(messages: readonly SupportChatMessage[]): SupportChatMessage[] {
  const size = (message: SupportChatMessage) =>
    Math.min(message.content.length, SUPPORT_CHAT_MAX_CONTENT_LENGTH);
  let history = messages.slice(-SUPPORT_CHAT_MAX_MESSAGES);
  let total = history.reduce((sum, message) => sum + size(message), 0);
  while (history.length > 1 && total > SUPPORT_CHAT_MAX_HISTORY_CHARS) {
    total -= size(history[0]);
    history = history.slice(1);
  }
  return history;
}

export type SupportChatContextRole = 'CUSTOMER' | 'CHEF';

export interface SupportChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const requestSchema = z.object({
  contextRole: z.enum(['CUSTOMER', 'CHEF']),
  orderId: z.string().uuid().optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        // Prior assistant replies are echoed back; clamp so one long reply cannot wedge the chat.
        content: z
          .string()
          .trim()
          .min(1)
          .transform(value => value.slice(0, SUPPORT_CHAT_MAX_CONTENT_LENGTH)),
      }),
    )
    .refine(messages => messages[messages.length - 1]?.role === 'user'),
});

const responseSchema = z.object({
  reply: z.string().trim().min(1),
  supportCase: z
    .object({
      id: z.string().min(1),
      caseNumber: z.string().trim().min(1).max(64),
    })
    .nullable(),
});

export type SupportChatResponse = z.infer<typeof responseSchema>;

export const supportChatApi = {
  async send(
    contextRole: SupportChatContextRole,
    messages: readonly SupportChatMessage[],
    orderId?: string,
  ): Promise<SupportChatResponse> {
    const request = requestSchema.safeParse({
      contextRole,
      orderId,
      messages: recentHistory(messages),
    });
    if (!request.success) {
      throw new AppApiError(
        'SUPPORT_CHAT_INVALID',
        'That message could not be sent. Please edit it and try again.',
      );
    }

    const response = await httpClient.post<unknown>(
      SUPPORT_CHAT_PATH,
      // Tells the assistant to give in-app navigation steps rather than website ones.
      {...request.data, channel: 'APP'},
      {
        timeout: SUPPORT_CHAT_TIMEOUT_MS,
      },
    );
    const parsed = responseSchema.safeParse(response);
    if (!parsed.success) {
      throw new AppApiError(
        'SUPPORT_CHAT_INVALID_RESPONSE',
        'The assistant reply could not be verified. Please try again.',
      );
    }
    return parsed.data;
  },
};
