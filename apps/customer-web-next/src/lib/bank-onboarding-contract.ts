import { z } from "zod";

export const bankConsentVersion = "craves-bank-validation-20260914-v1";
export const bankSubmissionSchema = z.object({
  requestKey: z.string().uuid(), expectedCurrentId: z.string().uuid().nullable(),
  accountHolderName: z.string().trim().min(2).max(120),
  accountNumber: z.string().regex(/^[0-9]{6,24}$/),
  accountNumberConfirmation: z.string().regex(/^[0-9]{6,24}$/),
  ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/),
  consent: z.literal(true), consentVersion: z.literal(bankConsentVersion),
}).strict().refine(value => value.accountNumber === value.accountNumberConfirmation, {message: "Bank account numbers must match"});
export const bankStatusSchema = z.object({
  id: z.string().uuid().nullable(),
  state: z.enum(["NOT_SUBMITTED", "QUEUED", "SUBMITTING", "VALIDATING", "UNKNOWN", "WAITING_APPROVAL", "VERIFIED", "VALIDATION_FAILED", "NAME_MISMATCH", "APPLICANT_ACTION_REQUIRED", "SUPERSEDED"]),
  lastFour: z.string().regex(/^[0-9]{4}$/).nullable(), ifsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/).nullable(),
  bankValidated: z.boolean(), applicationApproved: z.boolean(), automaticActivation: z.boolean(),
  message: z.string().max(1000), updatedAt: z.string().datetime().nullable(),
});
export type BankStatus = z.infer<typeof bankStatusSchema>;
export const bankControlChangeSchema = z.object({
  expectedRevision: z.number().int().nonnegative(), submissionsEnabled: z.boolean(), validationEnabled: z.boolean(),
  maximumRequestsPerDay: z.number().int().min(1).max(10), reason: z.string().trim().min(1).max(1000),
}).strict();
export const bankControlsSchema = z.object({
  revision: z.number().int().nonnegative(), submissionsEnabled: z.boolean(), validationEnabled: z.boolean(),
  maximumRequestsPerDay: z.number().int().min(1).max(10), encryptionReady: z.boolean(), providerReady: z.boolean(),
  workerDeployed: z.boolean(), recent: z.array(z.object({chefId: z.string().uuid(), bank: bankStatusSchema})).max(100),
});
export type BankControls = z.infer<typeof bankControlsSchema>;
