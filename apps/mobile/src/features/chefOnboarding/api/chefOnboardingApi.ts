import { z } from 'zod';
import { httpClient } from '../../../core/http/httpClient';

export const proofOptions = [
  ['AADHAAR', 'Aadhaar card'],
  ['PAN', 'PAN card'],
  ['BANK_STATEMENT', 'Bank statement'],
  ['OTHER_GOVERNMENT_ID', 'Other government ID'],
] as const;
export const languages = [
  ['en', 'English'],
  ['as', 'Assamese'],
  ['bn', 'Bengali'],
  ['brx', 'Bodo'],
  ['doi', 'Dogri'],
  ['gu', 'Gujarati'],
  ['hi', 'Hindi'],
  ['kn', 'Kannada'],
  ['ks', 'Kashmiri'],
  ['kok', 'Konkani'],
  ['mai', 'Maithili'],
  ['ml', 'Malayalam'],
  ['mni', 'Manipuri'],
  ['mr', 'Marathi'],
  ['ne', 'Nepali'],
  ['or', 'Odia'],
  ['pa', 'Punjabi'],
  ['sa', 'Sanskrit'],
  ['sat', 'Santali'],
  ['sd', 'Sindhi'],
  ['ta', 'Tamil'],
  ['te', 'Telugu'],
  ['ur', 'Urdu'],
] as const;
const detailSchema = z.object({
  email: z
    .string()
    .nullable()
    .transform(v => v ?? ''),
  firstName: z
    .string()
    .nullable()
    .transform(v => v ?? ''),
  lastName: z
    .string()
    .nullable()
    .transform(v => v ?? ''),
  dateOfBirth: z
    .string()
    .nullable()
    .transform(v => v ?? ''),
  kitchenName: z
    .string()
    .nullable()
    .transform(v => v ?? ''),
  kitchenDescription: z
    .string()
    .nullable()
    .transform(v => v ?? ''),
  addressLine1: z
    .string()
    .nullable()
    .transform(v => v ?? ''),
  addressLine2: z
    .string()
    .nullable()
    .transform(v => v ?? ''),
  landmark: z
    .string()
    .nullable()
    .transform(v => v ?? ''),
  city: z
    .string()
    .nullable()
    .transform(v => v ?? ''),
  state: z
    .string()
    .nullable()
    .transform(v => v ?? ''),
  postalCode: z
    .string()
    .nullable()
    .transform(v => v ?? ''),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  proofKind: z
    .enum(['AADHAAR', 'PAN', 'BANK_STATEMENT', 'OTHER_GOVERNMENT_ID'])
    .nullable(),
  otherGovernmentId: z
    .string()
    .nullable()
    .transform(v => v ?? ''),
  fssaiNumber: z
    .string()
    .nullable()
    .transform(v => v ?? ''),
  language: z.enum(languages.map(v => v[0])),
});
export type OnboardingDetails = z.infer<typeof detailSchema>;
export const emptyDetails: OnboardingDetails = {
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
};
const document = z.object({
  id: z.string().uuid(),
  documentType: z.string(),
  originalFileName: z.string(),
  status: z.enum(['UPLOADED', 'APPROVED', 'REJECTED']),
  reviewReason: z.string().nullable().optional(),
});
const stateSchema = z.object({
  enabled: z.boolean(),
  legacy: z.boolean(),
  version: z.number().int().nonnegative(),
  resumeStep: z.enum([
    'personal',
    'kitchen',
    'kitchen-photos',
    'fssai',
    'documents',
    'review',
    'waiting',
    'legacy',
  ]),
  submitted: z.boolean(),
  phoneNumber: z.string(),
  details: detailSchema.nullable(),
  application: z.object({
    id: z.string().uuid().nullable(),
    status: z.enum(['NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED']),
    rejectionReason: z.string().nullable().optional(),
  }),
  documents: z.array(document).max(20),
  requiredDocuments: z.array(z.string()).max(5),
  supportPhone: z.string().regex(/^[+0-9]{10,15}$/),
  supportEmail: z.string().email(),
});
export type OnboardingState = z.infer<typeof stateSchema>;
export function parseState(value: unknown): OnboardingState {
  return stateSchema.parse(value);
}
const emailSchema = z.object({
  email: z.string().nullable(),
  emailVerified: z.boolean(),
  emailRevision: z.number().int().nonnegative(),
  serverTime: z.string(),
  pending: z
    .object({
      challengeId: z.string().uuid(),
      maskedEmail: z.string(),
      expiresAt: z.string(),
      resendAvailableAt: z.string(),
      deliveryStatus: z.enum(['PENDING', 'ACCEPTED', 'UNKNOWN', 'UNAVAILABLE']),
    })
    .nullable(),
});
export type EmailState = z.infer<typeof emailSchema>;
const contentSchema = z.object({
  id: z.string().uuid(),
  language: z.string(),
  title: z.string(),
  kind: z.enum(['ARTICLE', 'VIDEO']),
  body: z.string().nullable(),
  published: z.boolean(),
  ready: z.boolean(),
});
export type LearningContent = z.infer<typeof contentSchema>;
export function proofNeedsBack(proof: OnboardingDetails['proofKind']) {
  return proof === 'AADHAAR' || proof === 'OTHER_GOVERNMENT_ID';
}
// UUIDs scope idempotent requests to a signed-in identity; they are not credentials.
export function requestId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, key => {
    const value = Math.floor(Math.random() * 16);
    return (key === 'x' ? value : (value & 3) | 8).toString(16);
  });
}
export const chefOnboardingApi = {
  async mine() {
    return parseState(await httpClient.get<unknown>('/api/v1/chef/onboarding'));
  },
  async save(version: number, details: OnboardingDetails) {
    return parseState(
      await httpClient.put<unknown>('/api/v1/chef/onboarding', {
        expectedVersion: version,
        details,
      }),
    );
  },
  async submit(version: number) {
    return parseState(
      await httpClient.post<unknown>('/api/v1/chef/onboarding/submit', {
        expectedVersion: version,
      }),
    );
  },
  async help(key: string, message: string) {
    return z
      .object({ caseNumber: z.string() })
      .parse(
        await httpClient.post<unknown>('/api/v1/chef/onboarding/help', {
          requestKey: key,
          message,
        }),
      );
  },
  async content(language: string) {
    return z
      .array(contentSchema)
      .max(50)
      .parse(
        await httpClient.get<unknown>('/api/v1/chef/onboarding/content', {
          params: { language },
        }),
      );
  },
  async playback(id: string) {
    const result = z
      .object({ url: z.string().url() })
      .parse(
        await httpClient.get<unknown>(
          '/api/v1/chef/onboarding/content/' + id + '/playback',
        ),
      );
    if (!result.url.startsWith('https://')) {
      throw new Error('Secure video access is unavailable.');
    }
    return result.url;
  },
  async upload(
    type: string,
    asset: { uri: string; name: string; type: string },
  ) {
    const form = new FormData();
    form.append('file', asset as unknown as Blob);
    await httpClient.post('/api/v1/chef/application/proof-files', form, {
      params: { documentType: type },
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return this.mine();
  },
  async email(
    action?: 'challenges' | 'resend' | 'verify',
    body?: Record<string, string>,
  ) {
    const path =
      '/api/v1/auth/email-verification' + (action ? '/' + action : '');
    const raw = action
      ? await httpClient.post<unknown>(path, body)
      : await httpClient.get<unknown>(path);
    return emailSchema.parse(raw);
  },
};
