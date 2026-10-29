import type {RiderMe} from '../api/contract';
import {resolveGate} from './gate';

const me: RiderMe = {
  riderId: 'r1',
  name: 'Ravi',
  phoneMasked: '+91 ••••• •4321',
  status: 'ACTIVE',
  termsVersion: '2026-10',
  acceptedTermsVersion: '2026-10',
  language: 'en',
  minAppVersion: '1.0.0',
  supportPhone: '+914000000000',
  features: {payoutsEnabled: true, withdrawEnabled: false},
};

describe('rider gate', () => {
  it('lets an active rider with current terms in', () => {
    expect(resolveGate(me, '1.0.0', false)).toEqual({kind: 'ready'});
  });

  it.each(['NOT_RIDER', 'PENDING', 'SUSPENDED', 'DEACTIVATED'] as const)(
    'sends %s riders to account status',
    status => {
      expect(resolveGate({...me, status}, '1.0.0', false)).toEqual({
        kind: 'account',
        block: status,
      });
    },
  );

  it('asks for an update between shifts only', () => {
    const old = {...me, minAppVersion: '1.1.0'};
    expect(resolveGate(old, '1.0.0', false)).toEqual({kind: 'account', block: 'UPDATE_REQUIRED'});
    expect(resolveGate(old, '1.0.0', true)).toEqual({kind: 'ready'});
  });

  it('shows the privacy notice first, before a pending rider sends documents, never mid-shift (P2-09)', () => {
    const privacyNotice = {version: '2027-05-v1', url: 'https://craves.in/riders/privacy/{language}', accepted: false};
    expect(resolveGate({...me, status: 'PENDING', privacyNotice}, '1.0.0', false)).toEqual({kind: 'privacy'});
    expect(resolveGate({...me, acceptedTermsVersion: undefined, privacyNotice}, '1.0.0', false)).toEqual({kind: 'privacy'});
    expect(resolveGate({...me, privacyNotice}, '1.0.0', true)).toEqual({kind: 'ready'});
    expect(resolveGate({...me, privacyNotice: {...privacyNotice, accepted: true}}, '1.0.0', false)).toEqual({kind: 'ready'});
  });

  it('shows new terms until accepted', () => {
    expect(resolveGate({...me, acceptedTermsVersion: undefined}, '1.0.0', false)).toEqual({
      kind: 'terms',
    });
    expect(resolveGate({...me, termsVersion: '2026-11'}, '1.0.0', true)).toEqual({kind: 'terms'});
  });
});
