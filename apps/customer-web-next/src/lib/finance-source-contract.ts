import { z } from "zod";
const id = z.string().regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/);
const exact = z.string().regex(/^\d{1,14}(\.\d{1,2})?$/);
const evidence = z.string().trim().min(1).max(240);
export const taxProfileSchema = z.object({
  stateCode: z.literal("36"), supplyRegime: z.literal("RESTAURANT_ECO_9_5"),
  registrationStatus: z.enum(["UNREGISTERED", "REGISTERED"]), gstin: z.string().max(15).nullable(),
  declaredAggregateTurnover: exact, financialYear: z.string().regex(/^20\d{2}-\d{2}$/), declarationDate: z.string().date(),
  withholdingRate: z.string().regex(/^\d{1,3}(\.\d{1,6})?$/).refine(value => Number(value) <= 100),
  withholdingEvidence: evidence, classificationEvidence: evidence, feeTermsEvidence: evidence,
}).strict().superRefine((value, context) => {
  if (value.registrationStatus === "REGISTERED" && !/^36[0-9A-Z]{13}$/.test(value.gstin || "")) context.addIssue({code: z.ZodIssueCode.custom, message: "A matching GSTIN is required"});
  if (value.registrationStatus === "UNREGISTERED" && value.gstin) context.addIssue({code: z.ZodIssueCode.custom, message: "Unregistered status cannot carry a GSTIN"});
});
export const taxProfileRequestSchema = z.object({profile: taxProfileSchema, reason: z.string().trim().min(1).max(1000)}).strict();
export const taxProfileVersionSchema = z.object({
  id, chefIdentityId: id, profile: taxProfileSchema, registrationReview: z.enum(["REGISTRATION_REVIEW_REQUIRED", "DECLARATION_RECORDED_NOT_GOVERNMENT_VERIFICATION"]),
  foodGstDeduction: z.literal("0.00"), gstTcsDeduction: z.literal("0.00"),
});
export type ChefTaxProfile = z.infer<typeof taxProfileSchema>;
export const sourceStatusSchema = z.object({
  finalizationEnabled: z.boolean(), activationNotice: z.string().max(500),
  states: z.array(z.object({state: z.string().max(30), lastResult: z.string().max(160), count: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)})).max(100),
  capturedCheckouts: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), postedEarnings: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  exceptions: z.array(z.object({chefOrderId: id, reason: z.string().max(160), createdAt: z.string().datetime({offset: true})})).max(100),
});
export const chefStatementSchema = z.object({
  version: z.literal(1), type: z.enum(["CHEF_EARNINGS_STATEMENT", "CHEF_SETTLEMENT_STATEMENT"]), reference: z.string().max(160),
  currency: z.literal("INR"), asOf: z.string().datetime({offset: true}),
  facts: z.array(z.object({label: z.string().max(100), value: z.string().max(800)})).max(40),
  tables: z.array(z.object({title: z.string().max(120), columns: z.array(z.string().max(100)).min(1).max(8), rows: z.array(z.array(z.string().max(800)).max(8)).max(1000)})).max(12),
  notice: z.string().max(1600),
}).superRefine((value, context) => {
  if (value.tables.reduce((total, table) => total + table.rows.length, 0) > 1000 || value.tables.some(table => table.rows.some(row => row.length !== table.columns.length))) context.addIssue({code: z.ZodIssueCode.custom, message: "Invalid statement table dimensions"});
});
export const statementPeriodSchema = z.object({from: z.string().date(), to: z.string().date(), kind: z.enum(["earnings", "settlements"])}).strict().refine(value => {
  const days = (Date.parse(value.to) - Date.parse(value.from)) / 86400000;
  return days > 0 && days <= 31;
}, "Choose an end-exclusive period of 1 to 31 days");
export const canonicalFinanceId = id;
