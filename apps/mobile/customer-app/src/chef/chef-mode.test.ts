import assert from 'node:assert/strict';
import test from 'node:test';
import { hasChefRole, parseChefApplicationSummary } from './chef-mode';

test('derives chef access only from backend roles', () => {
  assert.equal(hasChefRole({ id: '1', phoneNumber: '+919999999999', displayName: null, status: 'ACTIVE', roles: ['CUSTOMER', 'CHEF'] }), true);
  assert.equal(hasChefRole({ id: '1', phoneNumber: '+919999999999', displayName: null, status: 'ACTIVE', roles: ['CUSTOMER'] }), false);
});

test('reduces application response to safe status fields', () => {
  const parsed = parseChefApplicationSummary({ status: 'PENDING', identityId: 'private', phoneNumber: 'private', documents: [{ documentType: 'PAN_CARD', blobName: 'private' }] });
  assert.equal(parsed?.status, 'PENDING');
  assert.deepEqual(parsed?.documentTypes, ['PAN_CARD']);
  assert.equal('identityId' in (parsed ?? {}), false);
  assert.equal('documents' in (parsed ?? {}), false);
});

test('rejects unknown application states', () => {
  assert.equal(parseChefApplicationSummary({ status: 'AUTO_APPROVED' }), null);
});
