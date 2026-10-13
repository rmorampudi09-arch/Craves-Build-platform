import {apiClient} from '../../../core/http/apiClient';
import {httpClient} from '../../../core/http/httpClient';

/** Same contract as the website's chef application (user-chef-service /chef/onboarding). */
export const ONBOARDING_LANGUAGES = [
  ['en', 'English'],
  ['as', 'অসমীয়া'],
  ['bn', 'বাংলা'],
  ['brx', 'बड़ो'],
  ['doi', 'डोगरी'],
  ['gu', 'ગુજરાતી'],
  ['hi', 'हिन्दी'],
  ['kn', 'ಕನ್ನಡ'],
  ['ks', 'کٲشُر'],
  ['kok', 'कोंकणी'],
  ['mai', 'मैथिली'],
  ['ml', 'മലയാളം'],
  ['mni', 'মৈতৈলোন্'],
  ['mr', 'मराठी'],
  ['ne', 'नेपाली'],
  ['or', 'ଓଡ଼ିଆ'],
  ['pa', 'ਪੰਜਾਬੀ'],
  ['sa', 'संस्कृतम्'],
  ['sat', 'ᱥᱟᱱᱛᱟᱲᱤ'],
  ['sd', 'سنڌي'],
  ['ta', 'தமிழ்'],
  ['te', 'తెలుగు'],
  ['ur', 'اردو'],
] as const;
export const LANGUAGE_ENGLISH_NAMES: Record<string, string> = {
  as: 'Assamese', bn: 'Bengali', brx: 'Bodo', doi: 'Dogri', gu: 'Gujarati', hi: 'Hindi', kn: 'Kannada',
  ks: 'Kashmiri', kok: 'Konkani', mai: 'Maithili', ml: 'Malayalam', mni: 'Manipuri', mr: 'Marathi',
  ne: 'Nepali', or: 'Odia', pa: 'Punjabi', sa: 'Sanskrit', sat: 'Santali', sd: 'Sindhi', ta: 'Tamil',
  te: 'Telugu', ur: 'Urdu',
};
export const PROOF_OPTIONS = [
  ['AADHAAR', 'Aadhaar card'],
  ['PAN', 'PAN card'],
  ['BANK_STATEMENT', 'Bank statement'],
  ['OTHER_GOVERNMENT_ID', 'Other government ID'],
] as const;
export type ProofKind = (typeof PROOF_OPTIONS)[number][0];
export const CORRECTION_SECTIONS = ['personal', 'kitchen', 'fssai', 'documents', 'bank'] as const;
export const TERMS_VERSION_FALLBACK = 'craves-chef-terms-20261008-v1';

export type ChefApplicationStatus = 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED';
export type ChefApplicationSummary = {
  id: string | null;
  status: ChefApplicationStatus;
  rejectionReason: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  referenceCode: string | null;
};
export type ChefEvidence = {
  id: string;
  documentType: string;
  originalFileName: string;
  fileSizeBytes: number;
  status: 'UPLOADED' | 'APPROVED' | 'REJECTED';
  reviewReason: string | null;
};
export type OnboardingDetails = {
  email: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  kitchenName: string;
  kitchenDescription: string;
  addressLine1: string;
  addressLine2: string;
  landmark: string;
  city: string;
  state: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
  proofKind: ProofKind | null;
  otherGovernmentId: string;
  fssaiNumber: string;
  language: string;
  /** Other government ID only: false when the document has no back side. */
  proofHasBack: boolean | null;
};
export type CallbackRequest = {caseNumber: string; status: 'OPEN' | 'CONTACTED' | 'RESOLVED'; requestedAt: string};
export type OnboardingState = {
  enabled: boolean;
  legacy: boolean;
  version: number;
  submitted: boolean;
  bankEnrollmentRequired: boolean;
  phoneNumber: string;
  details: OnboardingDetails | null;
  application: ChefApplicationSummary;
  documents: ChefEvidence[];
  supportPhone: string;
  supportEmail: string;
  progress?: {
    status: string;
    reason: string | null;
    nextAction: string;
    fssaiVerified: boolean;
    termsVersion: string;
    sections: string[];
  };
  callbackRequest: CallbackRequest | null;
};
export type LearningContent = {
  id: string;
  language: string;
  title: string;
  kind: 'ARTICLE' | 'VIDEO';
  body: string | null;
};
export type UploadFile = {uri: string; name: string; type: string};

export const EMPTY_ONBOARDING: OnboardingDetails = {
  email: '',
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  kitchenName: '',
  kitchenDescription: '',
  addressLine1: '',
  addressLine2: '',
  landmark: '',
  city: '',
  state: '',
  postalCode: '',
  latitude: null,
  longitude: null,
  proofKind: null,
  otherGovernmentId: '',
  fssaiNumber: '',
  language: 'en',
  proofHasBack: null,
};

export function proofNeedsBack(proof: ProofKind | null, hasBack: boolean | null = null): boolean {
  return proof === 'AADHAAR' || (proof === 'OTHER_GOVERNMENT_ID' && hasBack !== false);
}

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
const textOrNull = (value: unknown): string | null | undefined =>
  value == null ? null : typeof value === 'string' ? value : undefined;
const APPLICATION_STATUSES = new Set(['NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED']);
const EVIDENCE_STATUSES = new Set(['UPLOADED', 'APPROVED', 'REJECTED']);

function parseApplication(value: unknown): ChefApplicationSummary | null {
  const raw = record(value);
  if (!raw || !APPLICATION_STATUSES.has(raw.status as string)) return null;
  const fields = ['id', 'rejectionReason', 'submittedAt', 'reviewedAt', 'referenceCode'].map(key => textOrNull(raw[key]));
  if (fields.includes(undefined)) return null;
  const [id, rejectionReason, submittedAt, reviewedAt, referenceCode] = fields as (string | null)[];
  return {id, status: raw.status as ChefApplicationStatus, rejectionReason, submittedAt, reviewedAt, referenceCode};
}

function parseEvidence(value: unknown): ChefEvidence | null {
  const raw = record(value);
  if (
    !raw ||
    typeof raw.id !== 'string' ||
    typeof raw.documentType !== 'string' ||
    typeof raw.originalFileName !== 'string' ||
    typeof raw.fileSizeBytes !== 'number' ||
    !EVIDENCE_STATUSES.has(raw.status as string)
  )
    return null;
  const reason = typeof raw.reviewReason === 'string' ? raw.reviewReason.replace(/[\r\n]+/g, ' ').trim().slice(0, 1000) : '';
  return {
    id: raw.id,
    documentType: raw.documentType,
    originalFileName: raw.originalFileName,
    fileSizeBytes: raw.fileSizeBytes,
    status: raw.status as ChefEvidence['status'],
    reviewReason: reason || null,
  };
}

function parseDetails(value: unknown): OnboardingDetails | null | undefined {
  if (value == null) return null;
  const d = record(value);
  if (!d) return undefined;
  const next = {...EMPTY_ONBOARDING};
  for (const key of Object.keys(EMPTY_ONBOARDING) as (keyof OnboardingDetails)[]) {
    if (key === 'latitude' || key === 'longitude' || key === 'proofKind' || key === 'proofHasBack') continue;
    if (d[key] != null && typeof d[key] !== 'string') return undefined;
    Object.assign(next, {[key]: d[key] ?? ''});
  }
  const coordinate = (raw: unknown, limit: number) =>
    raw == null ? null : typeof raw === 'number' && Number.isFinite(raw) && Math.abs(raw) <= limit ? raw : undefined;
  const latitude = coordinate(d.latitude, 90);
  const longitude = coordinate(d.longitude, 180);
  if (latitude === undefined || longitude === undefined) return undefined;
  if (d.proofKind != null && !PROOF_OPTIONS.some(([key]) => key === d.proofKind)) return undefined;
  if (d.proofHasBack != null && typeof d.proofHasBack !== 'boolean') return undefined;
  if (!ONBOARDING_LANGUAGES.some(([key]) => key === next.language)) next.language = 'en';
  return {
    ...next,
    latitude,
    longitude,
    proofKind: (d.proofKind ?? null) as ProofKind | null,
    proofHasBack: (d.proofHasBack ?? null) as boolean | null,
  };
}

function parseCallback(value: unknown): CallbackRequest | null | undefined {
  if (value == null) return null;
  const raw = record(value);
  return raw &&
    typeof raw.caseNumber === 'string' &&
    (raw.status === 'OPEN' || raw.status === 'CONTACTED' || raw.status === 'RESOLVED') &&
    typeof raw.requestedAt === 'string'
    ? {caseNumber: raw.caseNumber, status: raw.status, requestedAt: raw.requestedAt}
    : undefined;
}

export function parseOnboardingState(value: unknown): OnboardingState | null {
  const raw = record(value);
  if (!raw) return null;
  const application = parseApplication(raw.application);
  const documents = Array.isArray(raw.documents) ? raw.documents.map(parseEvidence) : null;
  const details = parseDetails(raw.details);
  const callbackRequest = parseCallback(raw.callbackRequest);
  if (
    !application ||
    !documents ||
    documents.some(item => item === null) ||
    details === undefined ||
    callbackRequest === undefined ||
    typeof raw.enabled !== 'boolean' ||
    typeof raw.legacy !== 'boolean' ||
    typeof raw.submitted !== 'boolean' ||
    typeof raw.version !== 'number' ||
    !Number.isSafeInteger(raw.version) ||
    raw.version < 0 ||
    typeof raw.phoneNumber !== 'string' ||
    typeof raw.supportPhone !== 'string' ||
    typeof raw.supportEmail !== 'string'
  )
    return null;
  const progress = record(raw.progress);
  return {
    enabled: raw.enabled,
    legacy: raw.legacy,
    version: raw.version,
    submitted: raw.submitted,
    bankEnrollmentRequired: raw.bankEnrollmentRequired !== false,
    phoneNumber: raw.phoneNumber,
    details,
    application,
    documents: documents as ChefEvidence[],
    supportPhone: raw.supportPhone,
    supportEmail: raw.supportEmail,
    callbackRequest,
    ...(progress &&
    typeof progress.status === 'string' &&
    typeof progress.nextAction === 'string' &&
    typeof progress.fssaiVerified === 'boolean' &&
    typeof progress.termsVersion === 'string' &&
    (progress.reason === null || typeof progress.reason === 'string')
      ? {
          progress: {
            status: progress.status,
            reason: progress.reason as string | null,
            nextAction: progress.nextAction,
            fssaiVerified: progress.fssaiVerified,
            termsVersion: progress.termsVersion,
            // Older services omit sections; unknown names are dropped rather than trusted.
            sections: Array.isArray(progress.sections)
              ? CORRECTION_SECTIONS.filter(section => (progress.sections as unknown[]).includes(section))
              : [],
          },
        }
      : {}),
  };
}

function requireState(value: unknown): OnboardingState {
  const state = parseOnboardingState(value);
  if (!state) throw new Error('We could not verify your saved application. Please retry.');
  return state;
}

function requireHttpsUrl(value: unknown, message: string): string {
  const raw = record(value);
  if (!raw || typeof raw.url !== 'string' || !raw.url.startsWith('https://')) throw new Error(message);
  return raw.url;
}

const ROUTE = '/api/v1/chef/onboarding';
/** Long forms and uploads over mobile data need more than the default 12 s. */
const SLOW = {timeout: 45000};

export const chefOnboardingApi = {
  async load(): Promise<OnboardingState> {
    return requireState(await httpClient.get<unknown>(ROUTE, SLOW));
  },
  /** PUT is a full save of a section; PATCH keeps a draft with relaxed checks ("Save & exit"). */
  async save(expectedVersion: number, details: OnboardingDetails, partial = false): Promise<OnboardingState> {
    const body = {expectedVersion, details: {...details, dateOfBirth: details.dateOfBirth || null}};
    return requireState(
      partial ? await httpClient.patch<unknown>(ROUTE, body, SLOW) : await httpClient.put<unknown>(ROUTE, body, SLOW),
    );
  },
  async submit(expectedVersion: number, termsVersion: string): Promise<OnboardingState> {
    return requireState(
      await httpClient.post<unknown>(`${ROUTE}/submit`, {expectedVersion, termsAccepted: true, termsVersion}, SLOW),
    );
  },
  async requestHelp(requestKey: string, message: string): Promise<string> {
    const raw = record(await httpClient.post<unknown>(`${ROUTE}/help`, {requestKey, message}, SLOW));
    if (!raw || typeof raw.caseNumber !== 'string' || !raw.caseNumber)
      throw new Error('Your callback request could not be confirmed. Retry to check the same request.');
    return raw.caseNumber;
  },
  async removeDocument(id: string, expectedVersion: number): Promise<OnboardingState> {
    // httpClient.delete sends no body; this endpoint needs the version in it.
    const response = await apiClient.request<unknown>({
      method: 'DELETE',
      url: `${ROUTE}/documents/${encodeURIComponent(id)}`,
      data: {expectedVersion},
      ...SLOW,
    });
    return requireState(response.data);
  },
  async preview(id: string): Promise<string> {
    return requireHttpsUrl(
      await httpClient.get<unknown>(`${ROUTE}/documents/${encodeURIComponent(id)}/preview`),
      'Preview unavailable.',
    );
  },
  async content(language: string): Promise<LearningContent[]> {
    const raw = await httpClient.get<unknown>(`${ROUTE}/content`, {params: {language}});
    if (!Array.isArray(raw) || raw.length > 100) throw new Error('The video guide could not be loaded.');
    return raw.flatMap(item => {
      const value = record(item);
      return value &&
        typeof value.id === 'string' &&
        typeof value.title === 'string' &&
        typeof value.language === 'string' &&
        (value.kind === 'ARTICLE' || value.kind === 'VIDEO') &&
        value.published === true &&
        value.ready === true
        ? [{
            id: value.id,
            language: value.language,
            title: value.title,
            kind: value.kind,
            body: typeof value.body === 'string' ? value.body : null,
          } as LearningContent]
        : [];
    });
  },
  async playback(id: string): Promise<string> {
    return requireHttpsUrl(
      await httpClient.get<unknown>(`${ROUTE}/content/${encodeURIComponent(id)}/playback`),
      'The video could not be opened. Please try again.',
    );
  },
  /** Multipart through the API (no presigned URL); returns the new document id. */
  async upload(documentType: string, file: UploadFile): Promise<string> {
    const form = new FormData();
    form.append('file', file as unknown as Blob);
    const raw = record(
      await httpClient.post<unknown>(
        `/api/v1/chef/application/proof-files?documentType=${encodeURIComponent(documentType)}`,
        form,
        SLOW,
      ),
    );
    return raw && typeof raw.id === 'string' ? raw.id : '';
  },
  async bankBranch(ifsc: string): Promise<{bankName: string; branchName: string}> {
    const raw = record(await httpClient.get<unknown>(`/api/v1/chef-onboarding/bank/ifsc/${encodeURIComponent(ifsc)}`));
    if (!raw || raw.ifsc !== ifsc || typeof raw.bankName !== 'string' || typeof raw.branchName !== 'string' || !raw.bankName || !raw.branchName)
      throw new Error('We couldn’t find this IFSC. Check it and try again.');
    return {bankName: raw.bankName, branchName: raw.branchName};
  },
};

/** Safe copy for the upload error codes the service returns (same table as the website). */
export const UPLOAD_ERRORS: Record<string, string> = {
  DOCUMENT_FILE_REQUIRED: 'Choose a non-empty file to upload.',
  DOCUMENT_FILE_TOO_LARGE: 'Choose a file no larger than 10 MB.',
  DOCUMENT_FILE_TYPE_NOT_ALLOWED: 'Choose a JPG, PNG or PDF file.',
  DOCUMENT_CONTENT_TYPE_MISMATCH: 'The file contents do not match its format. Choose the original photo.',
  DOCUMENT_FILE_SIZE_INVALID: 'The complete file could not be read. Select it again and retry.',
  DOCUMENT_FILE_UNREADABLE: 'The file could not be read. Select it again and retry.',
  DOCUMENT_STORE_NOT_CONFIGURED: 'Craves document storage is not ready. Your file format is not the issue. Please contact support.',
  DOCUMENT_STORAGE_PRIVACY_REQUIRED: 'Secure document storage is temporarily unavailable. Please try again later.',
  DOCUMENT_UPLOAD_FAILED: 'Craves could not store your document. Please try again later or contact support.',
  DOCUMENT_UPLOAD_UNAVAILABLE: 'Craves document storage is temporarily unavailable. Please try again later.',
  CHEF_APPLICATION_REQUIRED: 'Save your kitchen address before uploading photos or documents.',
  CHEF_DOCUMENT_TYPE_NOT_ALLOWED: 'Choose one of the documents required for your application.',
  CHEF_DOCUMENT_ALREADY_APPROVED: 'This document is already approved and cannot be replaced.',
  CHEF_ALREADY_APPROVED: 'Your Chef application is approved, so its documents cannot be replaced.',
};
