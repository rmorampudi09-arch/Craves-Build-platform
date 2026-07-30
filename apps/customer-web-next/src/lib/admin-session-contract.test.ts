import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAdminSession } from './admin-session-contract.ts';

const identity = {
  id: '11111111-2222-4333-8444-555555555555',
  displayName: 'Craves Admin',
  roles: ['CUSTOMER', 'ADMIN'],
  phoneNumber: '+919999999999',
  email: 'private@example.com'
};

test('enables admin only from backend ADMIN role', () => {
  const parsed = parseAdminSession(identity);
  assert.equal(parsed?.adminEnabled, true);
  assert.deepEqual(parsed?.roles, ['CUSTOMER', 'ADMIN']);
});

test('keeps private profile fields out of the public admin view', () => {
  const parsed = parseAdminSession(identity);
  assert.equal('phoneNumber' in (parsed ?? {}), false);
  assert.equal('email' in (parsed ?? {}), false);
});

test('rejects invalid identity responses', () => {
  assert.equal(parseAdminSession({ ...identity, id: 'bad' }), null);
  assert.equal(parseAdminSession({ ...identity, roles: [] }), null);
});
