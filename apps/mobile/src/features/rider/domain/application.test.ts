import type {RiderProfile} from '../api/contract';
import {applicationOf, requiredDocuments, resumeStep, vehicleModel} from './application';

const doc = (type: string, status: RiderProfile['documents'][number]['status'], reason?: string) => ({type, label: type, status, reason});
const petrol = (documents: RiderProfile['documents'], payout: Partial<RiderProfile> = {}): RiderProfile => ({
  vehicle: {label: 'Honda Activa 6G', kind: 'PETROL'},
  documents,
  ...payout,
});
const ALL = ['DL', 'RC', 'INSURANCE', 'PUC', 'PAN', 'BANK', 'SELFIE'];

describe('the application stage, as the server and the ops console count it', () => {
  it('asks for what a vehicle needs; a rider ops added without a kind sends the petrol set', () => {
    expect(requiredDocuments('BICYCLE')).toEqual(['PAN', 'BANK', 'SELFIE']);
    expect(requiredDocuments('ELECTRIC')).not.toContain('PUC');
    expect(requiredDocuments(undefined)).toEqual(ALL);
  });

  it('counts the reference selfie once the server lists it, so a server that asks for none yet still works', () => {
    const sixIn = ALL.slice(0, 6).map(type => doc(type, 'PENDING'));
    expect(applicationOf(petrol(sixIn)).documents.map(item => item.type)).toEqual(ALL.slice(0, 6));
    expect(resumeStep(applicationOf(petrol(sixIn)))).toBe('payout');
    const asked = applicationOf(petrol([...sixIn, doc('SELFIE', 'MISSING')]));
    expect(asked.documents.map(item => item.type)).toEqual(ALL);
    expect(resumeStep(asked)).toBe('documents');
  });

  it('is the rider’s turn while anything was never sent', () => {
    const application = applicationOf(petrol([...ALL.slice(0, 5).map(type => doc(type, 'PENDING')), doc('SELFIE', 'MISSING')]));
    expect(application.stage).toBe('APPLY');
    expect(application.documents.map(item => item.status)).toEqual(['PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'MISSING', 'MISSING']);
    expect(application.sent).toBe(5);
    expect(application.payout).toBe('MISSING');
    expect(resumeStep(application)).toBe('documents');
  });

  it('goes on to the payout account once every photo is in', () => {
    const application = applicationOf(petrol(ALL.map(type => doc(type, 'PENDING'))));
    expect(application.stage).toBe('APPLY');
    expect(resumeStep(application)).toBe('payout');
  });

  it('is ops’s turn once everything is in, accepted or not yet checked', () => {
    const application = applicationOf(petrol(ALL.map((type, index) => doc(type, index % 2 ? 'VERIFIED' : 'PENDING')), {payoutAccountSubmitted: 'ra****@okaxis'}));
    expect(application.stage).toBe('REVIEW');
    expect(application.sent).toBe(7);
    expect(application.payout).toBe('SENT');
  });

  it('lists only what ops sent back, with its reason, and a returned payout account', () => {
    const sentBack = applicationOf(petrol([...ALL.slice(1).map(type => doc(type, 'VERIFIED')), doc('DL', 'REJECTED', 'Blurry')], {payoutAccountReturned: true}));
    expect(sentBack.stage).toBe('FIX');
    expect(sentBack.toFix).toEqual([doc('DL', 'REJECTED', 'Blurry')]);
    expect(sentBack.payout).toBe('RETURNED');
    // A document that expired before approval is sent again too.
    expect(applicationOf(petrol(ALL.map(type => doc(type, type === 'PUC' ? 'EXPIRED' : 'VERIFIED')), {payoutAccountMasked: 'xxxxxx1234'})).stage).toBe('FIX');
  });

  it('keeps a model the rider typed and drops the kind’s own name', () => {
    expect(vehicleModel('Honda Activa 6G')).toBe('Honda Activa 6G');
    expect(vehicleModel('Petrol two-wheeler')).toBeUndefined();
    expect(vehicleModel(undefined)).toBeUndefined();
  });
});
