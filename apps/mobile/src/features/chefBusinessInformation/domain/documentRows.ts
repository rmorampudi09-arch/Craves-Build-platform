import {PROOF_OPTIONS, type ChefEvidence, type OnboardingState} from '../../chefOnboarding/api/chefOnboardingApi';
import {formatDate, formatFssai} from '../../chefOnboarding/domain/chefOnboardingFlow';
import type {StatusChipTone} from '../../chefShell/components/ui';
import {humanizeCode} from '../../chefShell/domain/humanizeCode';
import type {IconName} from '../../../shared/components/Icon';

export interface DocumentRow {
  icon: IconName;
  title: string;
  subtitle: string;
  chip: {label: string; tone: StatusChipTone};
  /** The document the chef can open; null for a line that is not a file (FSSAI). */
  previewId: string | null;
}

const APPROVED = {label: 'Approved', tone: 'ready'} as const;
const UNDER_REVIEW = {label: 'Under review', tone: 'cooking'} as const;
const NEEDS_UPDATE = {label: 'Needs update', tone: 'new'} as const;

const ORDER = ['SELECTED_PROOF_FRONT', 'SELECTED_PROOF_BACK', 'FSSAI', 'KITCHEN_PHOTO_1', 'KITCHEN_PHOTO_2'];

/** The ID proof the chef chose in the application, as `Aadhaar card`. */
function proofName(details: OnboardingState['details']): string {
  if (details?.proofKind === 'OTHER_GOVERNMENT_ID') {
    return details.otherGovernmentId.trim() || 'Other government ID';
  }
  return PROOF_OPTIONS.find(([kind]) => kind === details?.proofKind)?.[1] ?? 'ID proof';
}

function titleOf(document: ChefEvidence, details: OnboardingState['details']): string {
  switch (document.documentType) {
    case 'SELECTED_PROOF_FRONT':
      return `${proofName(details)} · front`;
    case 'SELECTED_PROOF_BACK':
      return `${proofName(details)} · back`;
    case 'KITCHEN_PHOTO_1':
      return 'Kitchen photo';
    case 'KITCHEN_PHOTO_2':
      return 'Cooking setup photo';
    default:
      return humanizeCode(document.documentType);
  }
}

const iconOf = (documentType: string): IconName =>
  documentType.startsWith('SELECTED_PROOF_') ? 'id-card' : documentType.startsWith('KITCHEN_PHOTO_') ? 'image' : 'document';

function fileRow(document: ChefEvidence, details: OnboardingState['details']): DocumentRow {
  const common = {icon: iconOf(document.documentType), title: titleOf(document, details), previewId: document.id};
  if (document.status === 'APPROVED') {
    return {...common, subtitle: 'Checked by Craves', chip: APPROVED};
  }
  if (document.status === 'REJECTED') {
    return {...common, subtitle: document.reviewReason || 'Please upload a new one', chip: NEEDS_UPDATE};
  }
  return {...common, subtitle: 'Craves is checking it', chip: UNDER_REVIEW};
}

/** Every document the chef gave in the application, in the order of the board: ID proof, FSSAI, kitchen photos, the rest. */
export function documentRows(state: OnboardingState): DocumentRow[] {
  const rows: {order: number; row: DocumentRow}[] = state.documents.map(document => {
    const found = ORDER.indexOf(document.documentType);
    return {order: found === -1 ? ORDER.length : found, row: fileRow(document, state.details)};
  });
  const fssai = state.details?.fssaiNumber.trim();
  if (fssai) {
    rows.push({
      order: ORDER.indexOf('FSSAI'),
      row: {
        icon: 'shield',
        title: 'FSSAI registration',
        subtitle: formatFssai(fssai),
        chip: state.progress?.fssaiVerified ? APPROVED : UNDER_REVIEW,
        previewId: null,
      },
    });
  }
  return rows.sort((a, b) => a.order - b.order).map(({row}) => row);
}

const PROOF_SHORT: Record<string, string> = {AADHAAR: 'Aadhaar', PAN: 'PAN', BANK_STATEMENT: 'Bank statement', OTHER_GOVERNMENT_ID: 'ID'};

/** `FSSAI, Aadhaar`: what the application gave, for the Profile row's second line. */
export function documentsSummary(state: OnboardingState): string {
  const proof = state.details?.proofKind ? PROOF_SHORT[state.details.proofKind] : null;
  return [state.details?.fssaiNumber.trim() ? 'FSSAI' : null, proof].filter(Boolean).join(', ');
}

export interface VerificationBanner {
  tone: 'ok' | 'wait' | 'problem';
  title: string;
  message: string;
}

/** For an application that was never started or finished. */
export const NOT_FINISHED_BANNER: VerificationBanner = {
  tone: 'wait',
  title: 'Your application is not finished',
  message: 'Finish your application to get verified.',
};

/** The status line at the top of Documents & verification. */
export function verificationBanner(state: OnboardingState): VerificationBanner {
  const {status, reviewedAt, rejectionReason} = state.application;
  if (status === 'APPROVED') {
    const date = formatDate(reviewedAt);
    return {tone: 'ok', title: 'Your kitchen is verified', message: date ? `Approved by Craves on ${date}` : 'Approved by Craves'};
  }
  if (status === 'REJECTED') {
    return {tone: 'problem', title: 'Your documents need an update', message: rejectionReason || 'Craves needs a few changes before it can approve your kitchen.'};
  }
  if (status === 'NOT_SUBMITTED') {
    return NOT_FINISHED_BANNER;
  }
  return {tone: 'wait', title: 'Craves is checking your documents', message: 'We will tell you as soon as it is done.'};
}
