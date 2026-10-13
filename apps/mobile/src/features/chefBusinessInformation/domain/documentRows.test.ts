import {EMPTY_ONBOARDING, type ChefEvidence, type OnboardingState} from '../../chefOnboarding/api/chefOnboardingApi';
import {documentRows, uploadChoices, verificationBanner} from './documentRows';

const evidence = (documentType: string, status: ChefEvidence['status'], reviewReason: string | null = null): ChefEvidence => ({
  id: `id-${documentType}`,
  documentType,
  originalFileName: 'photo.jpg',
  fileSizeBytes: 1000,
  status,
  reviewReason,
});

const state = (overrides: Partial<OnboardingState> = {}): OnboardingState => ({
  enabled: true,
  legacy: false,
  version: 3,
  submitted: true,
  bankEnrollmentRequired: false,
  phoneNumber: '+919876543210',
  details: {...EMPTY_ONBOARDING, proofKind: 'AADHAAR', fssaiNumber: '12345678901234'},
  application: {id: 'a1', status: 'APPROVED', rejectionReason: null, submittedAt: '2026-08-10T10:00:00Z', reviewedAt: '2026-08-13T10:00:00Z', referenceCode: null},
  documents: [],
  supportPhone: '+918012345678',
  supportEmail: 'help@craves.in',
  callbackRequest: null,
  ...overrides,
});

describe('documentRows', () => {
  it('names each file in plain words, with the ID proof the chef chose, and a chip for its status', () => {
    const rows = documentRows(
      state({
        documents: [
          evidence('KITCHEN_PHOTO_2', 'UPLOADED'),
          evidence('SELECTED_PROOF_BACK', 'APPROVED'),
          evidence('SELECTED_PROOF_FRONT', 'APPROVED'),
          evidence('KITCHEN_PHOTO_1', 'REJECTED', 'The photo is too dark.'),
        ],
        progress: {status: 'APPROVED', reason: null, nextAction: '', fssaiVerified: true, termsVersion: 'v1', sections: []},
      }),
    );
    expect(rows.map(row => [row.title, row.chip.label])).toEqual([
      ['Aadhaar card · front', 'Approved'],
      ['Aadhaar card · back', 'Approved'],
      ['FSSAI registration', 'Approved'],
      ['Kitchen photo', 'Needs update'],
      ['Cooking setup photo', 'Under review'],
    ]);
    expect(rows[3].subtitle).toBe('The photo is too dark.');
    expect(rows[2].subtitle).toBe('1234 5678 9012 34');
    expect(rows[0].previewId).toBe('id-SELECTED_PROOF_FRONT');
    expect(rows[2].previewId).toBeNull();
  });

  it('leaves out FSSAI when the chef gave no number, and shows it under review until Craves verified it', () => {
    expect(documentRows(state({details: {...EMPTY_ONBOARDING, fssaiNumber: ''}})).map(row => row.title)).toEqual([]);
    const rows = documentRows(state());
    expect(rows).toHaveLength(1);
    expect(rows[0].chip.label).toBe('Under review');
  });

  it('never shows a raw document type', () => {
    const rows = documentRows(state({details: null, documents: [evidence('OTHER_NEW_TYPE', 'UPLOADED')]}));
    expect(rows[0].title).toBe('Other new type');
  });
});

describe('verificationBanner', () => {
  it('says verified, with the date, for an approved kitchen', () => {
    expect(verificationBanner(state())).toEqual({tone: 'ok', title: 'Your kitchen is verified', message: 'Approved by Craves on 13 Aug 2026'});
  });

  it('says what is still needed when the application is not approved', () => {
    expect(verificationBanner(state({application: {...state().application, status: 'PENDING', reviewedAt: null}}))).toMatchObject({
      tone: 'wait',
      title: 'Craves is checking your documents',
    });
    expect(
      verificationBanner(state({application: {...state().application, status: 'REJECTED', rejectionReason: 'The ID is not readable.'}})),
    ).toEqual({tone: 'problem', title: 'Your documents need an update', message: 'The ID is not readable.'});
    expect(verificationBanner(state({application: {...state().application, status: 'NOT_SUBMITTED'}}))).toMatchObject({
      tone: 'wait',
      title: 'Your application is not finished',
    });
  });
});

describe('uploadChoices', () => {
  it('offers the four files the application takes, named with the chosen ID proof', () => {
    expect(uploadChoices(state())).toEqual([
      {type: 'SELECTED_PROOF_FRONT', title: 'Aadhaar card · front'},
      {type: 'SELECTED_PROOF_BACK', title: 'Aadhaar card · back'},
      {type: 'KITCHEN_PHOTO_1', title: 'Kitchen photo'},
      {type: 'KITCHEN_PHOTO_2', title: 'Cooking setup photo'},
    ]);
  });
});
