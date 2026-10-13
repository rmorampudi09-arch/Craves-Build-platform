import {EMPTY_ONBOARDING, parseOnboardingState, type OnboardingState} from '../api/chefOnboardingApi';
import {
  adultCutoff,
  afterSectionSave,
  applicationPhase,
  completedSections,
  entryScreen,
  firstIncompleteSection,
  validateChefSection,
} from './chefOnboardingFlow';

const details = {
  ...EMPTY_ONBOARDING,
  email: 'asha@example.com',
  firstName: 'Asha',
  lastName: 'Rao',
  dateOfBirth: '1990-05-01',
  kitchenName: 'Asha’s Kitchen',
  addressLine1: '12 Market Road',
  city: 'Hyderabad',
  state: 'Telangana',
  postalCode: '500001',
  latitude: 17.385,
  longitude: 78.4867,
  fssaiNumber: '12345678901234',
  proofKind: 'PAN' as const,
};
const document = (documentType: string, status = 'UPLOADED') => ({
  id: `${documentType}-id`,
  documentType,
  originalFileName: `${documentType}.jpg`,
  fileSizeBytes: 1000,
  status,
  reviewReason: null,
});
const raw = (overrides: Record<string, unknown> = {}) => ({
  enabled: true,
  legacy: false,
  version: 3,
  resumeStep: 'review',
  submitted: false,
  bankEnrollmentRequired: false,
  phoneNumber: '+919876543210',
  details,
  application: {id: 'app-1', status: 'NOT_SUBMITTED', rejectionReason: null, submittedAt: null, reviewedAt: null},
  documents: [document('KITCHEN_PHOTO_1'), document('KITCHEN_PHOTO_2'), document('SELECTED_PROOF_FRONT')],
  requiredDocuments: [],
  supportPhone: '+919000000000',
  supportEmail: 'support@craves.in',
  callbackRequest: null,
  ...overrides,
});
const state = (overrides: Record<string, unknown> = {}) => parseOnboardingState(raw(overrides)) as OnboardingState;

describe('chef onboarding flow (same rules as craves.in)', () => {
  it('parses the service state and refuses malformed responses', () => {
    expect(state().details?.proofKind).toBe('PAN');
    expect(parseOnboardingState(raw({version: -1}))).toBeNull();
    expect(parseOnboardingState(raw({details: {...details, latitude: 200}}))).toBeNull();
    expect(parseOnboardingState(raw({documents: [{id: 1}]}))).toBeNull();
  });

  it('counts a section complete only with its uploads; bank is skipped when not required', () => {
    const complete = completedSections(state(), null);
    expect(complete).toEqual({personal: true, kitchen: true, fssai: true, documents: true, bank: true});
    expect(completedSections(state({documents: [document('KITCHEN_PHOTO_1')]}), null).kitchen).toBe(false);
    // Aadhaar needs a back side.
    expect(completedSections(state({details: {...details, proofKind: 'AADHAAR'}}), null).documents).toBe(false);
    expect(firstIncompleteSection(state({details: {...details, fssaiNumber: ''}}), null)).toBe('fssai');
    expect(firstIncompleteSection(state(), null)).toBe('review');
  });

  it('walks only the sections Craves flagged when changes are requested', () => {
    const flagged = state({
      progress: {status: 'MORE_INFORMATION_REQUIRED', reason: 'Clearer photos', nextAction: 'EDIT_APPLICATION', fssaiVerified: false, termsVersion: 'v1', sections: ['kitchen', 'documents']},
    });
    expect(afterSectionSave('kitchen', false, flagged)).toBe('documents');
    expect(afterSectionSave('documents', false, flagged)).toBe('review');
    expect(afterSectionSave('personal', false, state())).toBe('kitchen');
    expect(afterSectionSave('documents', false, state())).toBe('review');
    expect(afterSectionSave('personal', true, state())).toBe('review');
    expect(entryScreen(flagged)).toBe('status');
  });

  it('opens new applicants on Basic details, returning ones on Welcome back, submitted ones on status', () => {
    expect(entryScreen(state({details: null}))).toBe('personal');
    expect(entryScreen(state())).toBe('resume');
    expect(entryScreen(state({submitted: true, application: {id: 'app-1', status: 'PENDING'}}))).toBe('status');
    expect(applicationPhase({application: {status: 'PENDING'}, progress: {status: 'UNDER_REVIEW'}, submitted: true})).toBe('UNDER_REVIEW');
  });

  it('needs an 18+ date of birth and a verified email', () => {
    const today = new Date(2026, 9, 12);
    expect(adultCutoff(today)).toBe('2008-10-12');
    const young = validateChefSection('personal', {...details, dateOfBirth: '2008-10-13'}, state(), true, today);
    expect(young[0]?.message).toMatch(/at least 18/);
    expect(validateChefSection('personal', {...details, dateOfBirth: '2008-10-12'}, state(), true, today)).toEqual([]);
    expect(validateChefSection('personal', details, state(), false, today)[0]?.field).toBe('email');
    expect(validateChefSection('personal', {...details, lastName: ''}, state(), true, today)[0]?.field).toBe('fullName');
  });

  it('lists every missing kitchen detail at once, in screen order', () => {
    const errors = validateChefSection('kitchen', {...details, kitchenName: '', postalCode: '5000', latitude: null}, state({documents: []}), true);
    expect(errors.map(error => error.field)).toEqual(['kitchenName', 'location', 'postalCode', 'KITCHEN_PHOTO_1', 'KITCHEN_PHOTO_2']);
  });
});
