export type DeletionScope = "CUSTOMER" | "CHEF" | "ALL";

export type DeletionStatus =
  | "PENDING_REVIEW"
  | "SCHEDULED"
  | "WAITING_ON_OPEN_ITEMS"
  | "ERASING"
  | "CANCELLED"
  | "REJECTED"
  | "COMPLETED";

/** One deletion request as the person's status endpoint returns it. */
export interface DeletionView {
  requestId: string;
  scope: DeletionScope;
  status: DeletionStatus;
  requestedAt: string;
  dueAt: string | null;
  reviewNote: string | null;
}

/** The side of Craves the person is on when they open the page; null when the page cannot tell. */
export type DeletionSide = "customer" | "chef" | null;

export interface AdminDeletionSummary {
  requestId: string;
  identityId: string;
  scope: DeletionScope;
  status: DeletionStatus;
  via: "APP" | "WEB";
  requestedAt: string;
  dueAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
}

export interface AdminDeletionStep {
  phase: string;
  service: string;
  status: string;
  attempts: number;
  lastError: string | null;
  completedAt: string | null;
}

export interface AdminDeletionBlocker {
  service: string;
  code: string;
  detail: string | null;
}

export interface AdminDeletionDetail {
  request: AdminDeletionSummary;
  phoneLast4: string | null;
  roles: string[];
  steps: AdminDeletionStep[];
  blockers: AdminDeletionBlocker[];
  /** Set by the website's route from the staff member's roles; the backend detail does not carry it. */
  canDecide: boolean;
}

export interface AdminDeletionPage {
  items: AdminDeletionSummary[];
  nextCursor: string | null;
}
