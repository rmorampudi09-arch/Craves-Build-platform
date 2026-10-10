import {AppApiError} from '../../../core/http/apiError';
import {httpClient} from '../../../core/http/httpClient';
import {
  SUPPORT_CHAT_PATH,
  supportChatApi,
  type SupportChatMessage,
} from './supportChatApi';

jest.mock('../../../core/http/httpClient', () => ({
  httpClient: {
    post: jest.fn(),
  },
}));

const postMock = httpClient.post as jest.Mock;
const orderId = '11111111-1111-4111-8111-111111111111';

function conversation(length: number): SupportChatMessage[] {
  return Array.from({length}, (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `message ${index}`,
  }));
}

describe('supportChatApi', () => {
  beforeEach(() => {
    postMock.mockReset();
    postMock.mockResolvedValue({reply: 'Here to help.', supportCase: null});
  });

  it('sends only the last 20 messages, oldest first, with the long-running timeout', async () => {
    await expect(
      supportChatApi.send('CUSTOMER', conversation(25), orderId),
    ).resolves.toEqual({
      reply: 'Here to help.',
      supportCase: null,
    });

    const [path, body, options] = postMock.mock.calls[0];
    expect(path).toBe(SUPPORT_CHAT_PATH);
    expect(options).toEqual({timeout: 45_000});
    expect(body.contextRole).toBe('CUSTOMER');
    expect(body.orderId).toBe(orderId);
    expect(body.messages).toHaveLength(20);
    expect(body.messages[0].content).toBe('message 5');
    expect(body.messages[19]).toEqual({role: 'user', content: 'message 24'});
  });

  it('drops the oldest turns once the history passes 8000 characters', async () => {
    const long = Array.from({length: 7}, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `${index}`.repeat(1500),
    })) as SupportChatMessage[];

    await supportChatApi.send('CUSTOMER', long);

    const sent: SupportChatMessage[] = postMock.mock.calls[0][1].messages;
    expect(sent).toHaveLength(5);
    expect(sent[0].content.startsWith('2')).toBe(true);
    expect(sent[4].role).toBe('user');
  });

  it('trims content and clamps long echoed assistant replies to 2000 characters', async () => {
    await supportChatApi.send('CHEF', [
      {role: 'user', content: 'hi'},
      {role: 'assistant', content: 'x'.repeat(2500)},
      {role: 'user', content: '  where is my payout?  '},
    ]);

    const body = postMock.mock.calls[0][1];
    expect(body.orderId).toBeUndefined();
    expect(body.messages[1].content).toHaveLength(2000);
    expect(body.messages[2].content).toBe('where is my payout?');
  });

  it.each([
    ['an empty history', [] as SupportChatMessage[], undefined],
    ['a history ending with the assistant', conversation(2), undefined],
    [
      'a blank message',
      [{role: 'user', content: '   '}] as SupportChatMessage[],
      undefined,
    ],
    ['a non-uuid order id', conversation(1), 'order-1'],
  ])(
    'rejects %s without calling the backend',
    async (_name, messages, badOrderId) => {
      await expect(
        supportChatApi.send('CUSTOMER', messages, badOrderId),
      ).rejects.toMatchObject({
        code: 'SUPPORT_CHAT_INVALID',
      });
      expect(postMock).not.toHaveBeenCalled();
    },
  );

  it('returns a created support case and rejects unverifiable replies', async () => {
    postMock.mockResolvedValueOnce({
      reply: 'I have raised this with our team.',
      supportCase: {id: 'case-1', caseNumber: 'CRV-1042'},
    });
    await expect(
      supportChatApi.send('CUSTOMER', conversation(1)),
    ).resolves.toMatchObject({
      supportCase: {caseNumber: 'CRV-1042'},
    });

    postMock.mockResolvedValueOnce({reply: '', supportCase: null});
    const failure = supportChatApi.send('CUSTOMER', conversation(1));
    await expect(failure).rejects.toBeInstanceOf(AppApiError);
    await expect(failure).rejects.toMatchObject({
      code: 'SUPPORT_CHAT_INVALID_RESPONSE',
    });
  });
});
