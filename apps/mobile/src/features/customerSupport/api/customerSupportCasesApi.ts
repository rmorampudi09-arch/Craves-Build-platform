import {httpClient} from '../../../core/http/httpClient';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CASE_NUMBER_PATTERN = /^CRV-[0-9A-F]{28}$/;

export const CUSTOMER_SUPPORT_CASES_AVAILABLE = false;

export const SUPPORT_CASE_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_REQUESTER',
  'RESOLVED',
  'CLOSED',
] as const;

export type SupportCaseStatus = (typeof SUPPORT_CASE_STATUSES)[number];
export type SupportRequesterRole = 'CUSTOMER' | 'CHEF';
export type SupportVisibleActorRole = SupportRequesterRole | 'SUPPORT';

export interface SupportCaseSummary {
  id: string;
  caseNumber: string;
  requesterIdentityId: string;
  requesterRole: SupportRequesterRole;
  orderId: string | null;
  subject: string;
  status: SupportCaseStatus;
  assignedToIdentityId: null;
  lastRequesterMessageAt: string | null;
  lastSupportMessageAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportCaseMessage {
  id: string;
  senderIdentityId: string | null;
  senderRole: SupportVisibleActorRole;
  body: string;
  internalNote: false;
  createdAt: string;
}

export interface SupportCaseStatusHistory {
  id: string;
  oldStatus: SupportCaseStatus | null;
  newStatus: SupportCaseStatus;
  actorIdentityId: string | null;
  actorRole: SupportVisibleActorRole;
  note: null;
  createdAt: string;
}

export interface SupportCaseDetail {
  supportCase: SupportCaseSummary;
  messages: SupportCaseMessage[];
  statusHistory: SupportCaseStatusHistory[];
}

export interface SupportCasePage {
  cases: SupportCaseSummary[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CreateCustomerSupportCaseRequest {
  contextRole: 'CUSTOMER';
  orderId: string | null;
  subject: string;
  message: string;
}

export interface AddSupportCaseMessageRequest {
  message: string;
}

const SUMMARY_KEYS = new Set([
  'id',
  'caseNumber',
  'requesterIdentityId',
  'requesterRole',
  'orderId',
  'subject',
  'status',
  'assignedToIdentityId',
  'lastRequesterMessageAt',
  'lastSupportMessageAt',
  'resolvedAt',
  'closedAt',
  'createdAt',
  'updatedAt',
]);

const MESSAGE_KEYS = new Set([
  'id',
  'senderIdentityId',
  'senderRole',
  'body',
  'internalNote',
  'createdAt',
]);

const HISTORY_KEYS = new Set([
  'id',
  'oldStatus',
  'newStatus',
  'actorIdentityId',
  'actorRole',
  'note',
  'createdAt',
]);

const DETAIL_KEYS = new Set(['supportCase', 'messages', 'statusHistory']);
const PAGE_KEYS = new Set(['cases', 'nextCursor', 'hasMore']);
const STATUS_SET = new Set<string>(SUPPORT_CASE_STATUSES);
const REQUESTER_ROLE_SET = new Set<string>(['CUSTOMER', 'CHEF']);
const ACTOR_ROLE_SET = new Set<string>(['CUSTOMER', 'CHEF', 'SUPPORT']);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(
  raw: Record<string, unknown>,
  expected: ReadonlySet<string>,
): boolean {
  const keys = Object.keys(raw);
  return keys.length === expected.size && keys.every(key => expected.has(key));
}

function uuid(value: unknown): string | null {
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : null;
}

function instant(value: unknown): string | null {
  return typeof value === 'string' &&
    value.length <= 40 &&
    !Number.isNaN(Date.parse(value))
    ? value
    : null;
}

function nullableInstant(value: unknown): string | null | undefined {
  if (value == null) return null;
  return instant(value) ?? undefined;
}

function requiredText(value: unknown, maximum: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 && [...normalized].length <= maximum
    ? normalized
    : null;
}

function status(value: unknown): SupportCaseStatus | null {
  return typeof value === 'string' && STATUS_SET.has(value)
    ? (value as SupportCaseStatus)
    : null;
}

function requesterRole(value: unknown): SupportRequesterRole | null {
  return typeof value === 'string' && REQUESTER_ROLE_SET.has(value)
    ? (value as SupportRequesterRole)
    : null;
}

function actorRole(value: unknown): SupportVisibleActorRole | null {
  return typeof value === 'string' && ACTOR_ROLE_SET.has(value)
    ? (value as SupportVisibleActorRole)
    : null;
}

export function parseSupportCaseSummary(value: unknown): SupportCaseSummary | null {
  const raw = asRecord(value);
  if (!raw || !exactKeys(raw, SUMMARY_KEYS)) return null;

  const id = uuid(raw.id);
  const caseNumber =
    typeof raw.caseNumber === 'string' && CASE_NUMBER_PATTERN.test(raw.caseNumber)
      ? raw.caseNumber
      : null;
  const requesterIdentityId = uuid(raw.requesterIdentityId);
  const parsedRequesterRole = requesterRole(raw.requesterRole);
  const orderId = raw.orderId == null ? null : uuid(raw.orderId);
  const subject = requiredText(raw.subject, 160);
  const parsedStatus = status(raw.status);
  const lastRequesterMessageAt = nullableInstant(raw.lastRequesterMessageAt);
  const lastSupportMessageAt = nullableInstant(raw.lastSupportMessageAt);
  const resolvedAt = nullableInstant(raw.resolvedAt);
  const closedAt = nullableInstant(raw.closedAt);
  const createdAt = instant(raw.createdAt);
  const updatedAt = instant(raw.updatedAt);

  if (
    !id ||
    !caseNumber ||
    !requesterIdentityId ||
    !parsedRequesterRole ||
    (raw.orderId != null && !orderId) ||
    !subject ||
    !parsedStatus ||
    raw.assignedToIdentityId !== null ||
    lastRequesterMessageAt === undefined ||
    lastSupportMessageAt === undefined ||
    resolvedAt === undefined ||
    closedAt === undefined ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }

  if (
    (parsedStatus === 'RESOLVED' && resolvedAt === null) ||
    (parsedStatus === 'CLOSED' && closedAt === null)
  ) {
    return null;
  }

  return {
    id,
    caseNumber,
    requesterIdentityId,
    requesterRole: parsedRequesterRole,
    orderId,
    subject,
    status: parsedStatus,
    assignedToIdentityId: null,
    lastRequesterMessageAt,
    lastSupportMessageAt,
    resolvedAt,
    closedAt,
    createdAt,
    updatedAt,
  };
}

export function parseSupportCaseMessage(value: unknown): SupportCaseMessage | null {
  const raw = asRecord(value);
  if (!raw || !exactKeys(raw, MESSAGE_KEYS)) return null;

  const id = uuid(raw.id);
  const role = actorRole(raw.senderRole);
  const senderIdentityId =
    raw.senderIdentityId == null ? null : uuid(raw.senderIdentityId);
  const body = requiredText(raw.body, 5000);
  const createdAt = instant(raw.createdAt);

  if (
    !id ||
    !role ||
    !body ||
    !createdAt ||
    raw.internalNote !== false ||
    (raw.senderIdentityId != null && !senderIdentityId) ||
    (role === 'SUPPORT' && senderIdentityId !== null) ||
    (role !== 'SUPPORT' && senderIdentityId === null)
  ) {
    return null;
  }

  return {
    id,
    senderIdentityId,
    senderRole: role,
    body,
    internalNote: false,
    createdAt,
  };
}

export function parseSupportCaseStatusHistory(
  value: unknown,
): SupportCaseStatusHistory | null {
  const raw = asRecord(value);
  if (!raw || !exactKeys(raw, HISTORY_KEYS)) return null;

  const id = uuid(raw.id);
  const oldStatus = raw.oldStatus == null ? null : status(raw.oldStatus);
  const newStatus = status(raw.newStatus);
  const role = actorRole(raw.actorRole);
  const actorIdentityId =
    raw.actorIdentityId == null ? null : uuid(raw.actorIdentityId);
  const createdAt = instant(raw.createdAt);

  if (
    !id ||
    (raw.oldStatus != null && !oldStatus) ||
    !newStatus ||
    !role ||
    raw.note !== null ||
    !createdAt ||
    (raw.actorIdentityId != null && !actorIdentityId) ||
    (role === 'SUPPORT' && actorIdentityId !== null) ||
    (role !== 'SUPPORT' && actorIdentityId === null)
  ) {
    return null;
  }

  return {
    id,
    oldStatus,
    newStatus,
    actorIdentityId,
    actorRole: role,
    note: null,
    createdAt,
  };
}

export function parseSupportCaseDetail(value: unknown): SupportCaseDetail | null {
  const raw = asRecord(value);
  if (
    !raw ||
    !exactKeys(raw, DETAIL_KEYS) ||
    !Array.isArray(raw.messages) ||
    !Array.isArray(raw.statusHistory)
  ) {
    return null;
  }

  const supportCase = parseSupportCaseSummary(raw.supportCase);
  const messages = raw.messages.map(parseSupportCaseMessage);
  const statusHistory = raw.statusHistory.map(parseSupportCaseStatusHistory);

  if (
    !supportCase ||
    messages.some(message => message === null) ||
    statusHistory.some(entry => entry === null)
  ) {
    return null;
  }

  return {
    supportCase,
    messages: messages as SupportCaseMessage[],
    statusHistory: statusHistory as SupportCaseStatusHistory[],
  };
}

export function parseSupportCasePage(value: unknown): SupportCasePage | null {
  const raw = asRecord(value);
  if (!raw || !exactKeys(raw, PAGE_KEYS) || !Array.isArray(raw.cases)) {
    return null;
  }

  const cases = raw.cases.map(parseSupportCaseSummary);
  const nextCursor =
    raw.nextCursor == null
      ? null
      : typeof raw.nextCursor === 'string' &&
          raw.nextCursor.length >= 1 &&
          raw.nextCursor.length <= 512
        ? raw.nextCursor
        : undefined;

  if (
    cases.some(entry => entry === null) ||
    nextCursor === undefined ||
    typeof raw.hasMore !== 'boolean' ||
    (raw.hasMore && nextCursor === null)
  ) {
    return null;
  }

  return {
    cases: cases as SupportCaseSummary[],
    nextCursor,
    hasMore: raw.hasMore,
  };
}

export function buildCreateCustomerSupportCaseRequest(input: {
  subject: string;
  message: string;
  orderId?: string | null;
}): CreateCustomerSupportCaseRequest {
  const subject = requiredText(input.subject, 160);
  const message = requiredText(input.message, 5000);
  const orderId = input.orderId == null ? null : uuid(input.orderId);

  if (!subject) throw new Error('CUSTOMER_SUPPORT_SUBJECT_INVALID');
  if (!message) throw new Error('CUSTOMER_SUPPORT_MESSAGE_INVALID');
  if (input.orderId != null && !orderId) {
    throw new Error('CUSTOMER_SUPPORT_ORDER_ID_INVALID');
  }

  return {
    contextRole: 'CUSTOMER',
    orderId,
    subject,
    message,
  };
}

export function buildAddSupportCaseMessageRequest(
  message: string,
): AddSupportCaseMessageRequest {
  const normalized = requiredText(message, 5000);
  if (!normalized) throw new Error('CUSTOMER_SUPPORT_MESSAGE_INVALID');
  return {message: normalized};
}

function requireCaseId(caseId: string): string {
  if (!UUID_PATTERN.test(caseId)) {
    throw new Error('CUSTOMER_SUPPORT_CASE_ID_INVALID');
  }
  return caseId;
}

function normalizeLimit(limit: number | undefined): number {
  const resolved = limit ?? 20;
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > 100) {
    throw new Error('CUSTOMER_SUPPORT_LIMIT_INVALID');
  }
  return resolved;
}

function parseDetailResponse(value: unknown): SupportCaseDetail {
  const parsed = parseSupportCaseDetail(value);
  if (!parsed || parsed.supportCase.requesterRole !== 'CUSTOMER') {
    throw new Error('CUSTOMER_SUPPORT_CASE_INVALID_RESPONSE');
  }
  return parsed;
}

export const customerSupportCasesApi = {
  async create(
    request: CreateCustomerSupportCaseRequest,
    signal?: AbortSignal,
  ): Promise<SupportCaseDetail> {
    const response = await httpClient.post<unknown>(
      '/api/v1/support/cases',
      request,
      {signal},
    );
    return parseDetailResponse(response);
  },

  async list(options?: {
    limit?: number;
    cursor?: string | null;
    status?: SupportCaseStatus | null;
    signal?: AbortSignal;
  }): Promise<SupportCasePage> {
    const limit = normalizeLimit(options?.limit);
    const params: Record<string, string | number> = {limit};

    if (options?.cursor) params.cursor = options.cursor;
    if (options?.status) {
      if (!STATUS_SET.has(options.status)) {
        throw new Error('CUSTOMER_SUPPORT_STATUS_INVALID');
      }
      params.status = options.status;
    }

    const response = await httpClient.get<unknown>('/api/v1/support/cases', {
      signal: options?.signal,
      params,
      dedupeKey: `customer-support-cases:${limit}:${
        options?.status ?? 'all'
      }:${options?.cursor ?? ''}`,
    });
    const parsed = parseSupportCasePage(response);
    if (
      !parsed ||
      parsed.cases.some(entry => entry.requesterRole !== 'CUSTOMER')
    ) {
      throw new Error('CUSTOMER_SUPPORT_CASES_INVALID_RESPONSE');
    }
    return parsed;
  },

  async get(caseId: string, signal?: AbortSignal): Promise<SupportCaseDetail> {
    const id = requireCaseId(caseId);
    const response = await httpClient.get<unknown>(
      `/api/v1/support/cases/${id}`,
      {
        signal,
        dedupeKey: `customer-support-case:${id}`,
      },
    );
    return parseDetailResponse(response);
  },

  async addMessage(
    caseId: string,
    request: AddSupportCaseMessageRequest,
    signal?: AbortSignal,
  ): Promise<SupportCaseDetail> {
    const id = requireCaseId(caseId);
    const response = await httpClient.post<unknown>(
      `/api/v1/support/cases/${id}/messages`,
      request,
      {signal},
    );
    return parseDetailResponse(response);
  },
};
