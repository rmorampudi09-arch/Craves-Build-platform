import {httpClient} from '../../../core/http/httpClient';
import {
  buildAddSupportCaseMessageRequest,
  buildCreateCustomerSupportCaseRequest,
  customerSupportCasesApi,
  parseSupportCaseDetail,
  parseSupportCasePage,
  parseSupportCaseSummary,
} from './customerSupportCasesApi';

jest.mock('../../../core/http/httpClient', () => ({
  httpClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

const requesterIdentityId = '11111111-1111-4111-8111-111111111111';
const caseId = '22222222-2222-4222-8222-222222222222';
const messageId = '33333333-3333-4333-8333-333333333333';
const historyId = '44444444-4444-4444-8444-444444444444';

const summary = {
  id: caseId,
  caseNumber: 'CRV-2222222222224222822222222222',
  requesterIdentityId,
  requesterRole: 'CUSTOMER',
  orderId: null,
  subject: 'Payment issue',
  status: 'OPEN',
  assignedToIdentityId: null,
  lastRequesterMessageAt: '2026-09-19T12:00:00Z',
  lastSupportMessageAt: null,
  resolvedAt: null,
  closedAt: null,
  createdAt: '2026-09-19T12:00:00Z',
  updatedAt: '2026-09-19T12:00:00Z',
};

const detail = {
  supportCase: summary,
  messages: [
    {
      id: messageId,
      senderIdentityId: requesterIdentityId,
      senderRole: 'CUSTOMER',
      body: 'My payment was deducted.',
      internalNote: false,
      createdAt: '2026-09-19T12:00:00Z',
    },
    {
      id: '55555555-5555-4555-8555-555555555555',
      senderIdentityId: null,
      senderRole: 'SUPPORT',
      body: 'We are checking this.',
      internalNote: false,
      createdAt: '2026-09-19T12:05:00Z',
    },
  ],
  statusHistory: [
    {
      id: historyId,
      oldStatus: null,
      newStatus: 'OPEN',
      actorIdentityId: requesterIdentityId,
      actorRole: 'CUSTOMER',
      note: null,
      createdAt: '2026-09-19T12:00:00Z',
    },
  ],
};

describe('customerSupportCasesApi contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('parses requester-redacted support case summaries only', () => {
    expect(parseSupportCaseSummary(summary)).toEqual(summary);
    expect(
      parseSupportCaseSummary({
        ...summary,
        assignedToIdentityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      }),
    ).toBeNull();
    expect(
      parseSupportCaseSummary({...summary, requesterRole: 'SUPPORT_ADMIN'}),
    ).toBeNull();
  });

  it('rejects internal support identity and note leakage', () => {
    expect(parseSupportCaseDetail(detail)).toEqual(detail);

    expect(
      parseSupportCaseDetail({
        ...detail,
        messages: [
          {
            ...detail.messages[1],
            senderIdentityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          },
        ],
      }),
    ).toBeNull();

    expect(
      parseSupportCaseDetail({
        ...detail,
        statusHistory: [
          {
            ...detail.statusHistory[0],
            note: 'internal moderation note',
          },
        ],
      }),
    ).toBeNull();
  });

  it('builds exact customer create JSON and trims values', () => {
    expect(
      buildCreateCustomerSupportCaseRequest({
        subject: '  Payment issue  ',
        message: '  Please help  ',
      }),
    ).toEqual({
      contextRole: 'CUSTOMER',
      orderId: null,
      subject: 'Payment issue',
      message: 'Please help',
    });
  });

  it('rejects invalid create/reply input before network calls', () => {
    expect(() =>
      buildCreateCustomerSupportCaseRequest({
        subject: '',
        message: 'Help',
      }),
    ).toThrow('CUSTOMER_SUPPORT_SUBJECT_INVALID');

    expect(() =>
      buildCreateCustomerSupportCaseRequest({
        subject: 'Help',
        message: 'x'.repeat(5001),
      }),
    ).toThrow('CUSTOMER_SUPPORT_MESSAGE_INVALID');

    expect(() => buildAddSupportCaseMessageRequest('   ')).toThrow(
      'CUSTOMER_SUPPORT_MESSAGE_INVALID',
    );
  });

  it('creates a case with exact request JSON', async () => {
    (httpClient.post as jest.Mock).mockResolvedValue(detail);
    const request = buildCreateCustomerSupportCaseRequest({
      subject: 'Payment issue',
      message: 'My payment was deducted.',
    });

    await expect(customerSupportCasesApi.create(request)).resolves.toEqual(detail);

    expect(httpClient.post).toHaveBeenCalledWith(
      '/api/v1/support/cases',
      request,
      {signal: undefined},
    );
  });

  it('lists owned customer cases using bounded cursor paging', async () => {
    (httpClient.get as jest.Mock).mockResolvedValue({
      cases: [summary],
      nextCursor: 'cursor-1',
      hasMore: true,
    });

    await expect(
      customerSupportCasesApi.list({limit: 10, status: 'OPEN'}),
    ).resolves.toEqual({
      cases: [summary],
      nextCursor: 'cursor-1',
      hasMore: true,
    });

    expect(httpClient.get).toHaveBeenCalledWith('/api/v1/support/cases', {
      signal: undefined,
      params: {limit: 10, status: 'OPEN'},
      dedupeKey: 'customer-support-cases:10:OPEN:',
    });
  });

  it('requires a cursor when backend says more results exist', () => {
    expect(
      parseSupportCasePage({
        cases: [summary],
        nextCursor: null,
        hasMore: true,
      }),
    ).toBeNull();
  });

  it('gets and replies to exact case routes', async () => {
    (httpClient.get as jest.Mock).mockResolvedValue(detail);
    (httpClient.post as jest.Mock).mockResolvedValue(detail);

    await expect(customerSupportCasesApi.get(caseId)).resolves.toEqual(detail);
    expect(httpClient.get).toHaveBeenCalledWith(
      `/api/v1/support/cases/${caseId}`,
      {
        signal: undefined,
        dedupeKey: `customer-support-case:${caseId}`,
      },
    );

    const reply = buildAddSupportCaseMessageRequest('More information');
    await expect(
      customerSupportCasesApi.addMessage(caseId, reply),
    ).resolves.toEqual(detail);
    expect(httpClient.post).toHaveBeenCalledWith(
      `/api/v1/support/cases/${caseId}/messages`,
      reply,
      {signal: undefined},
    );
  });

  it('rejects invalid case ids and page sizes before network calls', async () => {
    await expect(customerSupportCasesApi.get('not-a-uuid')).rejects.toThrow(
      'CUSTOMER_SUPPORT_CASE_ID_INVALID',
    );
    await expect(customerSupportCasesApi.list({limit: 101})).rejects.toThrow(
      'CUSTOMER_SUPPORT_LIMIT_INVALID',
    );
  });
});
