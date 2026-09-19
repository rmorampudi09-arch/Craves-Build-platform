import {
  buildEmailVerificationIssueRequest,
  buildEmailVerificationResendRequest,
  buildEmailVerificationVerifyRequest,
  emailVerificationStateSchema,
} from './api/emailVerificationApi';

const requestId = '22222222-2222-4222-8222-222222222222';
const challengeId = '11111111-1111-4111-8111-111111111111';

const valid = {
  email: 'Chef@example.com',
  emailVerified: false,
  emailRevision: 3,
  pending: {
    challengeId,
    maskedEmail: 'C***@example.com',
    expiresAt: '2026-09-19T16:00:00Z',
    resendAvailableAt: '2026-09-19T15:55:00Z',
    deliveryStatus: 'ACCEPTED',
  },
  serverTime: '2026-09-19T15:54:00Z',
};

describe('email verification JSON contract', () => {
  it('sends the exact challenge body accepted by Auth', () => {
    expect(
      buildEmailVerificationIssueRequest(
        '  Chef!Ops@EXAMPLE.COM  ',
        requestId,
      ),
    ).toEqual({
      email: 'Chef!Ops@example.com',
      requestId,
    });
  });

  it('sends the exact resend body accepted by Auth', () => {
    expect(
      buildEmailVerificationResendRequest(challengeId, requestId),
    ).toEqual({
      challengeId,
      requestId,
    });
  });

  it('sends the exact verify body accepted by Auth', () => {
    expect(
      buildEmailVerificationVerifyRequest(challengeId, '012345'),
    ).toEqual({
      challengeId,
      code: '012345',
    });
  });

  it('accepts the exact Auth response', () => {
    expect(emailVerificationStateSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects unexpected response fields instead of trusting shape-compatible JSON', () => {
    expect(
      emailVerificationStateSchema.safeParse({
        ...valid,
        token: 'must-not-be-accepted',
      }).success,
    ).toBe(false);
    expect(
      emailVerificationStateSchema.safeParse({
        ...valid,
        pending: {...valid.pending, internalDeliveryId: 'secret'},
      }).success,
    ).toBe(false);
  });

  it('rejects invalid delivery state and non-Instant timestamps', () => {
    expect(
      emailVerificationStateSchema.safeParse({
        ...valid,
        pending: {...valid.pending, deliveryStatus: 'SENT'},
      }).success,
    ).toBe(false);
    expect(
      emailVerificationStateSchema.safeParse({
        ...valid,
        serverTime: '2026-09-19T15:54:00',
      }).success,
    ).toBe(false);
  });
});
