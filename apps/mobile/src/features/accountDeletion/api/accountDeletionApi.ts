import {z} from 'zod';
import {AppApiError, toAppApiError} from '../../../core/http/apiError';
import {httpClient} from '../../../core/http/httpClient';
import {deletionCopy} from '../domain/deletionCopy';
import type {DeletionScope, DeletionView} from '../domain/deletionTypes';

export const ACCOUNT_DELETION_PATH = '/api/v1/auth/me/deletion';

const deletionViewSchema = z.object({
  requestId: z.string().min(1),
  scope: z.enum(['CUSTOMER', 'CHEF', 'ALL']),
  status: z.enum([
    'PENDING_REVIEW',
    'SCHEDULED',
    'WAITING_ON_OPEN_ITEMS',
    'ERASING',
    'CANCELLED',
    'REJECTED',
    'COMPLETED',
  ]),
  requestedAt: z.string().min(1),
  dueAt: z.string().nullable(),
  reviewNote: z.string().nullable(),
});

function parseView(body: unknown): DeletionView {
  const parsed = deletionViewSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppApiError(
      'ACCOUNT_DELETION_INVALID_RESPONSE',
      deletionCopy.sendErrors.invalidResponse,
    );
  }
  return parsed.data;
}

export const accountDeletionApi = {
  /** The latest request, or null when the person never asked to delete. */
  async getLatest(): Promise<DeletionView | null> {
    let body: unknown;
    try {
      body = await httpClient.get<unknown>(ACCOUNT_DELETION_PATH);
    } catch (error) {
      const apiError = toAppApiError(error);
      if (apiError.code === 'NO_DELETION_REQUEST') {
        return null;
      }
      throw apiError;
    }
    return parseView(body);
  },

  async request(scope: DeletionScope): Promise<DeletionView> {
    try {
      return parseView(
        await httpClient.post<unknown>(ACCOUNT_DELETION_PATH, {
          scope,
          via: 'APP',
        }),
      );
    } catch (error) {
      throw toAppApiError(error);
    }
  },

  /** Cancels the open request: the person keeps their account. */
  async keep(): Promise<DeletionView> {
    try {
      return parseView(await httpClient.delete<unknown>(ACCOUNT_DELETION_PATH));
    } catch (error) {
      throw toAppApiError(error);
    }
  },
};
