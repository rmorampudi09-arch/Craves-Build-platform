import {httpClient} from '../../../core/http/httpClient';
import {
  parseSupportCaseDetail,
  parseSupportCasePage,
  type AddSupportCaseMessageRequest,
  type SupportCaseDetail,
  type SupportCasePage,
  type SupportCaseStatus,
} from '../../customerSupport/api/customerSupportCasesApi';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const CHEF_SUPPORT_CASES_AVAILABLE = false;

export interface CreateChefSupportCaseRequest {
  contextRole: 'CHEF';
  orderId: string | null;
  subject: string;
  message: string;
}

function requiredText(value: string, maximum: number, code: string): string {
  const normalized = value.trim();
  if (!normalized || [...normalized].length > maximum) {
    throw new Error(code);
  }
  return normalized;
}

function optionalOrderId(value?: string | null): string | null {
  if (value == null) return null;
  if (!UUID_PATTERN.test(value)) {
    throw new Error('CHEF_SUPPORT_ORDER_ID_INVALID');
  }
  return value;
}

export function buildCreateChefSupportCaseRequest(input: {
  subject: string;
  message: string;
  orderId?: string | null;
}): CreateChefSupportCaseRequest {
  return {
    contextRole: 'CHEF',
    orderId: optionalOrderId(input.orderId),
    subject: requiredText(
      input.subject,
      160,
      'CHEF_SUPPORT_SUBJECT_INVALID',
    ),
    message: requiredText(
      input.message,
      5000,
      'CHEF_SUPPORT_MESSAGE_INVALID',
    ),
  };
}

export function buildChefSupportMessageRequest(
  message: string,
): AddSupportCaseMessageRequest {
  return {
    message: requiredText(
      message,
      5000,
      'CHEF_SUPPORT_MESSAGE_INVALID',
    ),
  };
}

function requireCaseId(caseId: string): string {
  if (!UUID_PATTERN.test(caseId)) {
    throw new Error('CHEF_SUPPORT_CASE_ID_INVALID');
  }
  return caseId;
}

function normalizeLimit(limit: number | undefined): number {
  const resolved = limit ?? 20;
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > 100) {
    throw new Error('CHEF_SUPPORT_LIMIT_INVALID');
  }
  return resolved;
}

function parseDetail(value: unknown): SupportCaseDetail {
  const parsed = parseSupportCaseDetail(value);
  if (!parsed || parsed.supportCase.requesterRole !== 'CHEF') {
    throw new Error('CHEF_SUPPORT_CASE_INVALID_RESPONSE');
  }
  return parsed;
}

export const chefSupportCasesApi = {
  async create(
    request: CreateChefSupportCaseRequest,
    signal?: AbortSignal,
  ): Promise<SupportCaseDetail> {
    const response = await httpClient.post<unknown>(
      '/api/v1/support/cases',
      request,
      {signal},
    );
    return parseDetail(response);
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
    if (options?.status) params.status = options.status;

    const response = await httpClient.get<unknown>('/api/v1/support/cases', {
      signal: options?.signal,
      params,
      dedupeKey: `chef-support-cases:${limit}:${
        options?.status ?? 'all'
      }:${options?.cursor ?? ''}`,
    });

    const parsed = parseSupportCasePage(response);
    if (
      !parsed ||
      parsed.cases.some(entry => entry.requesterRole !== 'CHEF')
    ) {
      throw new Error('CHEF_SUPPORT_CASES_INVALID_RESPONSE');
    }
    return parsed;
  },

  async get(caseId: string, signal?: AbortSignal): Promise<SupportCaseDetail> {
    const id = requireCaseId(caseId);
    const response = await httpClient.get<unknown>(
      `/api/v1/support/cases/${id}`,
      {
        signal,
        dedupeKey: `chef-support-case:${id}`,
      },
    );
    return parseDetail(response);
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
    return parseDetail(response);
  },
};
