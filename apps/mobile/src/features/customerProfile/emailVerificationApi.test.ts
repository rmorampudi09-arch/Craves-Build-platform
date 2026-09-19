import {emailVerificationStateSchema} from './api/emailVerificationApi';

const valid = {
  email: 'chef@example.com',
  emailVerified: false,
  emailRevision: 3,
  pending: {
    challengeId: '11111111-1111-4111-8111-111111111111',
    maskedEmail: 'c***@example.com',
    expiresAt: '2026-09-19T16:00:00Z',
    resendAvailableAt: '2026-09-19T15:55:00Z',
    deliveryStatus: 'ACCEPTED',
  },
  serverTime: '2026-09-19T15:54:00Z',
};

describe('email verification JSON contract', () => {
  it('accepts the exact Auth response', () => {
    expect(emailVerificationStateSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects unexpected response fields instead of trusting shape-compatible JSON', () => {
    expect(emailVerificationStateSchema.safeParse({...valid, token: 'must-not-be-accepted'}).success).toBe(false);
    expect(emailVerificationStateSchema.safeParse({
      ...valid,
      pending: {...valid.pending, internalDeliveryId: 'secret'},
    }).success).toBe(false);
  });

  it('rejects invalid delivery state and malformed timestamps', () => {
    expect(emailVerificationStateSchema.safeParse({
      ...valid,
      pending: {...valid.pending, deliveryStatus: 'SENT'},
    }).success).toBe(false);
    expect(emailVerificationStateSchema.safeParse({...valid, serverTime: 'not-a-time'}).success).toBe(false);
  });
});
