import type {ChefBankStatus} from '../../chefBankOnboarding/api/chefBankOnboardingApi';
import {
  proofNeedsBack,
  type ChefApplicationSummary,
  type OnboardingDetails,
  type OnboardingState,
} from '../api/chefOnboardingApi';

/** Port of the website's chef-onboarding-flow.ts: same sections, rules and copy. */
export type ChefFormSection = 'personal' | 'kitchen' | 'fssai' | 'documents' | 'bank';
export type ChefFormScreen = ChefFormSection | 'resume' | 'review' | 'submitted' | 'status';
export const CHEF_SECTIONS: readonly ChefFormSection[] = ['personal', 'kitchen', 'fssai', 'documents', 'bank'];
export const CHEF_SECTION_TITLES: Record<ChefFormScreen, string> = {
  personal: 'Basic details',
  kitchen: 'Your kitchen',
  fssai: 'FSSAI details',
  documents: 'Identity verification',
  bank: 'Bank details',
  review: 'Review your application',
  resume: 'Welcome back',
  submitted: 'Application submitted',
  status: 'Your application',
};
export const CHEF_SECTION_DESCRIPTIONS: Record<ChefFormScreen, string> = {
  personal: 'Tell us a little about yourself.',
  kitchen: 'Tell us where you prepare your food.',
  fssai: 'Add your FSSAI registration number or get help applying.',
  documents: 'Upload a valid identity document.',
  bank: 'Add the account where you will receive your earnings.',
  review: 'Please check your details before submitting.',
  resume: 'Continue setting up your kitchen.',
  submitted:
    'Thank you for joining Craves. Your application has been received, and our team will review your details.',
  status: 'Your application status and what happens next.',
};
export const CHEF_SECTION_LABELS: Record<ChefFormSection, string> = {
  personal: 'Basic details',
  kitchen: 'Kitchen details',
  fssai: 'FSSAI',
  documents: 'Identity proof',
  bank: 'Bank details',
};
export const FSSAI_GUIDE_TITLE = 'How to apply for FSSAI';
export const FSSAI_GUIDE_DESCRIPTION = 'Follow these simple steps to apply for your registration.';

export function chefFullName(details: Pick<OnboardingDetails, 'firstName' | 'lastName'>): string {
  return [details.firstName, details.lastName].filter(Boolean).join(' ');
}
export function evidenceComplete(state: OnboardingState, type: string): boolean {
  return state.documents.some(
    document => document.documentType === type && (document.status === 'UPLOADED' || document.status === 'APPROVED'),
  );
}
export function sameChefBankName(left: string | null | undefined, right: string): boolean {
  const normalize = (value: string) =>
    value.normalize('NFKC').toUpperCase().replace(/[.\-'’]/g, ' ').replace(/\s+/g, ' ').trim();
  return Boolean(left && normalize(left) === normalize(right));
}
export function bankCanContinue(bank: ChefBankStatus | null): boolean {
  return Boolean(
    bank?.id && ['QUEUED', 'SUBMITTING', 'VALIDATING', 'WAITING_APPROVAL', 'VERIFIED'].includes(bank.state),
  );
}
export function completedSections(
  state: OnboardingState,
  bank: ChefBankStatus | null,
): Record<ChefFormSection, boolean> {
  const d = state.details;
  return {
    personal: Boolean(d?.firstName && d.lastName && d.dateOfBirth && d.email),
    kitchen: Boolean(
      d?.kitchenName &&
        d.addressLine1 &&
        d.city &&
        d.state &&
        d.postalCode &&
        d.latitude != null &&
        d.longitude != null &&
        evidenceComplete(state, 'KITCHEN_PHOTO_1') &&
        evidenceComplete(state, 'KITCHEN_PHOTO_2'),
    ),
    fssai: Boolean(d?.fssaiNumber && /^[0-9]{14}$/.test(d.fssaiNumber)),
    documents: Boolean(
      d?.proofKind &&
        evidenceComplete(state, 'SELECTED_PROOF_FRONT') &&
        (!proofNeedsBack(d.proofKind, d.proofHasBack) || evidenceComplete(state, 'SELECTED_PROOF_BACK')),
    ),
    bank:
      state.bankEnrollmentRequired === false ||
      (bankCanContinue(bank) &&
        sameChefBankName(bank?.accountHolderName, chefFullName(d ?? {firstName: '', lastName: ''}))),
  };
}
export type ChefSectionProgress = 'complete' | 'in-progress' | 'not-started' | 'attention';
const SECTION_DOCUMENTS: Record<ChefFormSection, readonly string[]> = {
  personal: [],
  kitchen: ['KITCHEN_PHOTO_1', 'KITCHEN_PHOTO_2'],
  fssai: ['FSSAI_LICENSE'],
  documents: ['SELECTED_PROOF_FRONT', 'SELECTED_PROOF_BACK'],
  bank: [],
};
export function sectionForDocument(type: string): ChefFormSection | null {
  return CHEF_SECTIONS.find(section => SECTION_DOCUMENTS[section].includes(type)) ?? null;
}
/** Sections a reviewer asked the applicant to change; empty unless more information is required. */
export function correctionSections(state: OnboardingState): ChefFormSection[] {
  return state.progress?.status === 'MORE_INFORMATION_REQUIRED'
    ? CHEF_SECTIONS.filter(section => state.progress?.sections.includes(section))
    : [];
}
export const MINIMUM_CHEF_AGE = 18;
/** Latest date of birth that is 18 today (yyyy-mm-dd, local calendar). */
export function adultCutoff(today = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${today.getFullYear() - MINIMUM_CHEF_AGE}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
}
export function sectionProgress(
  state: OnboardingState,
  bank: ChefBankStatus | null,
): Record<ChefFormSection, ChefSectionProgress> {
  const completion = completedSections(state, bank);
  const d = state.details;
  const hasDocument = (section: ChefFormSection, rejected: boolean) =>
    state.documents.some(
      document =>
        (document.status === 'REJECTED') === rejected && SECTION_DOCUMENTS[section].includes(document.documentType),
    );
  const started: Record<ChefFormSection, boolean> = {
    personal: Boolean(d && (d.firstName || d.lastName || d.dateOfBirth)),
    kitchen: Boolean(d && (d.kitchenName || d.addressLine1 || d.latitude != null)) || hasDocument('kitchen', false),
    fssai: Boolean(d?.fssaiNumber),
    documents: Boolean(d?.proofKind) || hasDocument('documents', false),
    bank: Boolean(bank?.id),
  };
  const requested = correctionSections(state);
  const result = {} as Record<ChefFormSection, ChefSectionProgress>;
  for (const section of CHEF_SECTIONS) {
    result[section] =
      hasDocument(section, true) || requested.includes(section)
        ? 'attention'
        : completion[section]
          ? 'complete'
          : started[section]
            ? 'in-progress'
            : 'not-started';
  }
  if (bank && ['VALIDATION_FAILED', 'NAME_MISMATCH', 'APPLICANT_ACTION_REQUIRED'].includes(bank.state))
    result.bank = 'attention';
  return result;
}

export type ChefApplicationPhase =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'MORE_INFORMATION_REQUIRED'
  | 'APPROVED'
  | 'REJECTED';
export function applicationPhase(input: {
  application: Pick<ChefApplicationSummary, 'status'>;
  progress?: {status: string} | null;
  submitted: boolean;
}): ChefApplicationPhase {
  const review = input.progress?.status;
  if (input.application.status === 'APPROVED') return 'APPROVED';
  if (review === 'MORE_INFORMATION_REQUIRED') return 'MORE_INFORMATION_REQUIRED';
  if (input.application.status === 'REJECTED') return 'REJECTED';
  if (input.application.status === 'NOT_SUBMITTED' || !input.submitted) return 'DRAFT';
  if (review === 'UNDER_REVIEW') return 'UNDER_REVIEW';
  return 'SUBMITTED';
}
export const APPLICATION_PHASE_COPY: Record<ChefApplicationPhase, {label: string; message: string}> = {
  DRAFT: {label: 'Draft', message: 'Your application is not complete.'},
  SUBMITTED: {label: 'Submitted', message: 'Your application has been submitted for review.'},
  UNDER_REVIEW: {label: 'Under review', message: 'Our team is reviewing your application.'},
  MORE_INFORMATION_REQUIRED: {label: 'More information required', message: 'Some details need to be updated.'},
  APPROVED: {label: 'Approved', message: 'Your application has been approved.'},
  REJECTED: {label: 'Not approved', message: 'Your application was not approved.'},
};

export function activeChefSections(state: OnboardingState | null): readonly ChefFormSection[] {
  return state?.bankEnrollmentRequired === false ? CHEF_SECTIONS.filter(section => section !== 'bank') : CHEF_SECTIONS;
}
export function firstIncompleteSection(state: OnboardingState, bank: ChefBankStatus | null): ChefFormSection | 'review' {
  const completion = completedSections(state, bank);
  return activeChefSections(state).find(section => !completion[section]) ?? 'review';
}
export function afterSectionSave(
  section: ChefFormSection,
  fromReview: boolean,
  state: OnboardingState | null = null,
): ChefFormScreen {
  if (fromReview) return 'review';
  // Changes Craves asked for: only the flagged sections, in order, then review. The rest is already done.
  const flagged = state ? correctionSections(state) : [];
  if (flagged.length)
    return flagged.find(next => CHEF_SECTIONS.indexOf(next) > CHEF_SECTIONS.indexOf(section)) ?? 'review';
  const sections = activeChefSections(state);
  return sections[sections.indexOf(section) + 1] ?? 'review';
}
/** The applicant may still change the saved application. */
export function applicationEditable(state: OnboardingState): boolean {
  return (
    state.enabled &&
    !state.submitted &&
    !state.legacy &&
    state.application.status !== 'APPROVED' &&
    !(state.application.status === 'REJECTED' && state.progress?.nextAction !== 'EDIT_APPLICATION')
  );
}
/** The screen a freshly loaded application opens on. */
export function entryScreen(state: OnboardingState): ChefFormScreen {
  return (state.application.status === 'APPROVED' && state.legacy) ||
    (state.application.status === 'REJECTED' && state.progress?.nextAction !== 'EDIT_APPLICATION') ||
    state.progress?.status === 'MORE_INFORMATION_REQUIRED' ||
    state.submitted ||
    (state.legacy && state.application.status === 'PENDING')
    ? 'status'
    : state.details
      ? 'resume'
      : 'personal';
}
export function kitchenAddress(details: OnboardingDetails): string {
  return [details.addressLine1, details.addressLine2, details.landmark, details.city, details.state, details.postalCode]
    .filter(Boolean)
    .join(', ');
}
export type ChefFieldError = {field: string; message: string};
/** Kitchen details the server needs before it creates the record photos are saved to. */
export const KITCHEN_REQUIRED: readonly (ChefFieldError & {label: string; noun: string})[] = [
  {field: 'kitchenName', label: 'Kitchen name', noun: 'kitchen name', message: 'Add your kitchen name.'},
  {
    field: 'location',
    label: 'Map pin',
    noun: 'map pin',
    message: 'Search for your kitchen address or use your current location to place the pin.',
  },
  {
    field: 'addressLine1',
    label: 'Flat / house number / building',
    noun: 'flat or house number',
    message: 'Add your flat, house number or building.',
  },
  {field: 'postalCode', label: 'PIN code', noun: 'PIN code', message: 'Enter a six-digit PIN code.'},
  {field: 'city', label: 'City', noun: 'city', message: 'Add your city.'},
  {field: 'state', label: 'State', noun: 'state', message: 'Add your state.'},
];
export function listInWords(items: readonly string[]): string {
  return items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
export function missingKitchenFields(details: OnboardingDetails) {
  const filled: Record<string, boolean> = {
    kitchenName: Boolean(details.kitchenName.trim()),
    location: details.latitude != null && details.longitude != null,
    addressLine1: Boolean(details.addressLine1.trim()),
    postalCode: /^\d{6}$/.test(details.postalCode),
    city: Boolean(details.city.trim()),
    state: Boolean(details.state.trim()),
  };
  return KITCHEN_REQUIRED.filter(item => !filled[item.field]);
}
/** Every problem in a section, in screen order, so all of them can be shown at once. */
export function validateChefSection(
  section: ChefFormSection,
  details: OnboardingDetails,
  state: OnboardingState,
  emailVerified: boolean,
  today = new Date(),
): ChefFieldError[] {
  if (section === 'personal') {
    if (!details.firstName.trim() || !details.lastName.trim())
      return [{field: 'fullName', message: 'Enter your full name, including your first and last name.'}];
    if (chefFullName(details).length > 120 || details.firstName.length > 100 || details.lastName.length > 100)
      return [{field: 'fullName', message: 'Keep your full name within 120 characters.'}];
    const birth = Date.parse(details.dateOfBirth);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(details.dateOfBirth) ||
      !Number.isFinite(birth) ||
      new Date(birth).toISOString().slice(0, 10) !== details.dateOfBirth ||
      details.dateOfBirth < '1900-01-01'
    )
      return [{field: 'dateOfBirth', message: 'Enter a valid date of birth.'}];
    if (details.dateOfBirth > adultCutoff(today))
      return [{field: 'dateOfBirth', message: 'You must be at least 18 years old to apply as a Craves home chef.'}];
    if (!state.phoneNumber) return [{field: 'phoneNumber', message: 'Sign in again to verify your mobile number.'}];
    if (!emailVerified) return [{field: 'email', message: 'Verify your email address before saving these details.'}];
  }
  if (section === 'kitchen') {
    const errors: ChefFieldError[] = missingKitchenFields(details).map(({field, message}) => ({field, message}));
    if (!evidenceComplete(state, 'KITCHEN_PHOTO_1'))
      errors.push({field: 'KITCHEN_PHOTO_1', message: 'Upload an overall kitchen photo.'});
    if (!evidenceComplete(state, 'KITCHEN_PHOTO_2'))
      errors.push({field: 'KITCHEN_PHOTO_2', message: 'Upload a cooking setup photo.'});
    return errors;
  }
  if (section === 'fssai' && !/^[0-9]{14}$/.test(details.fssaiNumber))
    return [{
      field: 'fssaiNumber',
      message:
        'Enter your 14-digit FSSAI registration number. You can save an incomplete application and return later.',
    }];
  if (section === 'documents') {
    if (!details.proofKind) return [{field: 'proofKind', message: 'Choose your identity document.'}];
    if (details.proofKind === 'OTHER_GOVERNMENT_ID' && !details.otherGovernmentId.trim())
      return [{field: 'otherGovernmentId', message: 'Enter the government ID name.'}];
    if (!evidenceComplete(state, 'SELECTED_PROOF_FRONT'))
      return [{field: 'SELECTED_PROOF_FRONT', message: 'Upload the front of your chosen document.'}];
    if (proofNeedsBack(details.proofKind, details.proofHasBack) && !evidenceComplete(state, 'SELECTED_PROOF_BACK'))
      return [{field: 'SELECTED_PROOF_BACK', message: 'Upload the back of your chosen document.'}];
  }
  return [];
}
export const INCOMPLETE_MESSAGES: Record<ChefFormSection, string> = {
  personal: 'Complete your basic details before submitting your application.',
  kitchen: 'Complete your kitchen details and add both kitchen photos before submitting.',
  fssai:
    'Add your 14-digit FSSAI registration number before submitting. If you don’t have one yet, use “Don’t have FSSAI?” for help.',
  documents: 'Upload your identity document before submitting your application.',
  bank: 'Confirm your bank details before submitting your application.',
};

export function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}
export function formatDateOfBirth(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? formatDate(`${value}T12:00:00`) : value;
}
export function formatFssai(value: string): string {
  return /^\d{14}$/.test(value) ? value.replace(/^(\d{4})(\d{4})(\d{4})(\d{2})$/, '$1 $2 $3 $4') : value;
}
export function formatPhone(value: string): string {
  const match = /^(?:\+?91)?(\d{5})(\d{5})$/.exec(value.replace(/\s/g, ''));
  return match ? `+91 ${match[1]} ${match[2]}` : value;
}
