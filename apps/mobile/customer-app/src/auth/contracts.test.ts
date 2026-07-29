import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMobileSession, sessionIsUsable } from './contracts.ts';

const now = Date.parse('2026-07-30T00:00:00Z');
const exchange = {
  accessToken: 'header.payload.signature',
  expiresIn: 3600,
  refreshToken: 'must-not-be-stored',
  identity: {
    id: '11111111-2222-4333-8444-555555555555',
    phoneNumber: '+919876543210',
    displayName: 'Ravi',
    status: 'ACTIVE',
    roles: ['CUSTOMER']
  }
};

test('parses a bounded mobile session without refresh token', () => {
  const session = parseMobileSession(exchange, now);
  assert.equal(session?.identity.phoneNumber, exchange.identity.phoneNumber);
  assert.equal(session?.expiresAt, '2026-07-30T01:00:00.000Z');
  assert.equal('refreshToken' in (session ?? {}), false);
});

test('rejects malformed or short sessions', () => {
  assert.equal(parseMobileSession({ ...exchange, expiresIn: 10 }, now), null);
  assert.equal(parseMobileSession({ ...exchange, identity: { ...exchange.identity, id: 'bad' } }, now), null);
});

test('requires active and unexpired sessions', () => {
  const session = parseMobileSession(exchange, now)!;
  assert.equal(sessionIsUsable(session, now), true);
  assert.equal(sessionIsUsable(session, now + 3_590_000), false);
  assert.equal(sessionIsUsable({ ...session, identity: { ...session.identity, status: 'DISABLED' } }, now), false);
});
