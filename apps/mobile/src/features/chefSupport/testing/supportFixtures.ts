import type {SupportCaseDetail, SupportCaseSummary} from '../../customerSupport/api/customerSupportCasesApi';

/** Support case fixtures for the Help & support screen tests. */
export const CASE_ID = '11111111-1111-4111-8111-111111111111';
export const CLOSED_CASE_ID = '22222222-2222-4222-8222-222222222222';

export function supportCase(overrides: Partial<SupportCaseSummary> = {}): SupportCaseSummary {
  return {
    id: CASE_ID,
    caseNumber: 'CRV-0000000000000000000000001042',
    requesterIdentityId: '33333333-3333-4333-8333-333333333333',
    requesterRole: 'CHEF',
    orderId: null,
    subject: 'Payout not received',
    status: 'OPEN',
    assignedToIdentityId: null,
    lastRequesterMessageAt: '2026-10-12T12:40:00Z',
    lastSupportMessageAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    resolvedAt: null,
    closedAt: null,
    createdAt: '2026-10-12T12:40:00Z',
    updatedAt: '2026-10-13T01:00:00Z',
    ...overrides,
  };
}

export function supportDetail(overrides: Partial<SupportCaseSummary> = {}, extra: Partial<SupportCaseDetail> = {}): SupportCaseDetail {
  return {
    supportCase: supportCase(overrides),
    messages: [
      {
        id: 'm1',
        senderIdentityId: '33333333-3333-4333-8333-333333333333',
        senderRole: 'CHEF',
        body: "My payout of ₹2,000 from 6 Oct hasn't reached my bank.",
        internalNote: false,
        createdAt: '2026-10-12T12:40:00Z',
      },
      {
        id: 'm2',
        senderIdentityId: null,
        senderRole: 'SUPPORT',
        body: 'Thanks. Please check your bank account details and we will resend it.',
        internalNote: false,
        createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
      },
    ],
    statusHistory: [],
    ...extra,
  };
}
