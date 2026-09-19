import {httpClient} from '../../../core/http/httpClient';
import {
  buildChefSupportMessageRequest,
  buildCreateChefSupportCaseRequest,
  chefSupportCasesApi,
} from './chefSupportCasesApi';

jest.mock('../../../core/http/httpClient', () => ({
  httpClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

const requesterIdentityId = '11111111-1111-4111-8111-111111111111';
const caseId = '22222222-2222-4222-8222-222222222222';

const summary = {
  id: caseId,
  caseNumber: 'CRV-2222222222224222822222222222',
  requesterIdentityId,
  requesterRole: 'CHEF',
  orderId: null,
  subject: 'Kitchen payout question',
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
      id: '33333333-3333-4333-8333-333333333333',
      senderIdentityId: requesterIdentityId,
      senderRole: 'CHEF',
      body: 'Please help with this payout.',
      internalNote: false,
      createdAt: '2026-09-19T12:00:00Z',
    },
  ],
  statusHistory: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      oldStatus: null,
      newStatus: 'OPEN',
      actorIdentityId: requesterIdentityId,
      actorRole: 'CHEF',
      note: null,
      createdAt: '2026-09-19T12:00:00Z',
    },
  ],
};

describe('chefSupportCasesApi contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds exact CHEF support create JSON', () => {
    expect(
      buildCreateChefSupportCaseRequest({
        subject: '  Kitchen payout question ',
        message: ' Please help ',
      }),
    ).toEqual({
      contextRole: 'CHEF',
      orderId: null,
      subject: 'Kitchen payout question',
      message: 'Please help',
    });
  });

  it('rejects invalid support input before network calls', () => {
    expect(() =>
      buildCreateChefSupportCaseRequest({
        subject: '',
        message: 'Help',
      }),
    ).toThrow('CHEF_SUPPORT_SUBJECT_INVALID');

    expect(() =>
      buildChefSupportMessageRequest('x'.repeat(5001)),
    ).toThrow('CHEF_SUPPORT_MESSAGE_INVALID');

    expect(() =>
      buildCreateChefSupportCaseRequest({
        subject: 'Order issue',
        message: 'Help',
        orderId: 'not-a-uuid',
      }),
    ).toThrow('CHEF_SUPPORT_ORDER_ID_INVALID');
  });

  it('creates a Chef-owned support case', async () => {
    (httpClient.post as jest.Mock).mockResolvedValue(detail);
    const request = buildCreateChefSupportCaseRequest({
      subject: 'Kitchen payout question',
      message: 'Please help with this payout.',
    });

    await expect(chefSupportCasesApi.create(request)).resolves.toEqual(detail);

    expect(httpClient.post).toHaveBeenCalledWith(
      '/api/v1/support/cases',
      request,
      {signal: undefined},
    );
  });

  it('lists only Chef-owned cases', async () => {
    (httpClient.get as jest.Mock).mockResolvedValue({
      cases: [summary],
      nextCursor: null,
      hasMore: false,
    });

    await expect(chefSupportCasesApi.list({limit: 20})).resolves.toEqual({
      cases: [summary],
      nextCursor: null,
      hasMore: false,
    });

    expect(httpClient.get).toHaveBeenCalledWith('/api/v1/support/cases', {
      signal: undefined,
      params: {limit: 20},
      dedupeKey: 'chef-support-cases:20:all:',
    });
  });

  it('rejects a customer support case from the Chef surface', async () => {
    (httpClient.get as jest.Mock).mockResolvedValue({
      cases: [{...summary, requesterRole: 'CUSTOMER'}],
      nextCursor: null,
      hasMore: false,
    });

    await expect(chefSupportCasesApi.list()).rejects.toThrow(
      'CHEF_SUPPORT_CASES_INVALID_RESPONSE',
    );
  });

  it('gets and replies through the exact requester support routes', async () => {
    (httpClient.get as jest.Mock).mockResolvedValue(detail);
    (httpClient.post as jest.Mock).mockResolvedValue(detail);

    await expect(chefSupportCasesApi.get(caseId)).resolves.toEqual(detail);
    expect(httpClient.get).toHaveBeenCalledWith(
      `/api/v1/support/cases/${caseId}`,
      {
        signal: undefined,
        dedupeKey: `chef-support-case:${caseId}`,
      },
    );

    const request = buildChefSupportMessageRequest('More information');
    await expect(
      chefSupportCasesApi.addMessage(caseId, request),
    ).resolves.toEqual(detail);
    expect(httpClient.post).toHaveBeenCalledWith(
      `/api/v1/support/cases/${caseId}/messages`,
      request,
      {signal: undefined},
    );
  });

  it('rejects invalid page sizes and case ids before network calls', async () => {
    await expect(chefSupportCasesApi.list({limit: 101})).rejects.toThrow(
      'CHEF_SUPPORT_LIMIT_INVALID',
    );
    await expect(chefSupportCasesApi.get('bad')).rejects.toThrow(
      'CHEF_SUPPORT_CASE_ID_INVALID',
    );
  });
});
