export type DeletionScope = 'CUSTOMER' | 'CHEF' | 'ALL';

export type DeletionStatus =
  | 'PENDING_REVIEW'
  | 'SCHEDULED'
  | 'WAITING_ON_OPEN_ITEMS'
  | 'ERASING'
  | 'CANCELLED'
  | 'REJECTED'
  | 'COMPLETED';

/** The open request the identity payload carries, enough for the banner and the paused-order text. */
export interface PendingDeletion {
  requestId: string;
  scope: DeletionScope;
  status: DeletionStatus;
  dueAt: string | null;
}

/** One deletion request as the status endpoint returns it. */
export interface DeletionView {
  requestId: string;
  scope: DeletionScope;
  status: DeletionStatus;
  requestedAt: string;
  dueAt: string | null;
  reviewNote: string | null;
}

/** The side of the app the person is signed in on. */
export type AppMode = 'CUSTOMER' | 'CHEF';
