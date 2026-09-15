export type AdminDirectoryHit = {
  entityType: "CUSTOMER" | "CHEF";
  identityId: string;
  recordId: string;
  displayName: string;
  secondaryLabel: string;
  status: string;
  matchField: string;
  maskedMatchValue: string;
};

export type AdminDirectorySearchResponse = {
  correlationId: string;
  queryType: string;
  hits: AdminDirectoryHit[];
};

export type CustomerCase = {
  correlationId: string;
  profile: {
    profileId: string;
    identityId: string;
    registeredPhoneNumber: string;
    firstName: string;
    lastName: string;
    email: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  };
  addresses: Array<{
    addressId: string;
    addressLabel: string;
    recipientName: string | null;
    contactPhoneNumber: string;
    addressLine1: string;
    addressLine2: string | null;
    landmark: string | null;
    areaName: string | null;
    districtName: string | null;
    city: string;
    state: string;
    postalCode: string | null;
    latitude: number | null;
    longitude: number | null;
    defaultAddress: boolean;
    createdAt: string | null;
    updatedAt: string | null;
  }>;
};

export type ChefCase = {
  correlationId: string;
  application: {
    applicationId: string;
    identityId: string;
    phoneNumber: string;
    email: string;
    firstName: string;
    lastName: string;
    addressLine1: string;
    addressLine2: string | null;
    landmark: string | null;
    city: string;
    state: string;
    postalCode: string | null;
    latitude: number | null;
    longitude: number | null;
    status: string;
    rejectionReason: string | null;
    submittedAt: string | null;
    reviewedAt: string | null;
    reviewedByIdentityId: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  };
  documents: Array<{
    documentId: string;
    documentType: string;
    originalFileName: string;
    contentType: string;
    fileSizeBytes: number;
    status: string;
    createdAt: string | null;
    updatedAt: string | null;
  }>;
  decisionHistory: Array<{
    auditId: string;
    adminIdentityId: string;
    decision: string;
    reason: string | null;
    createdAt: string | null;
  }>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown, max = 500): string | null => typeof value === "string" && value.trim() && value.length <= max ? value.trim() : null;
const nullableText = (value: unknown, max = 500): string | null => value == null ? null : text(value, max);
const uuid = (value: unknown): string | null => { const result = text(value, 64); return result && UUID.test(result) ? result : null; };
const date = (value: unknown): string | null => { const result = nullableText(value, 80); return result && !Number.isNaN(Date.parse(result)) ? result : null; };
const number = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const bool = (value: unknown): boolean | null => typeof value === "boolean" ? value : null;

export function parseAdminDirectorySearch(value: unknown): AdminDirectorySearchResponse | null {
  const root = record(value);
  const correlationId = uuid(root?.correlationId);
  const queryType = text(root?.queryType, 40);
  if (!root || !correlationId || !queryType || !Array.isArray(root.hits) || root.hits.length > 20) return null;
  const hits: AdminDirectoryHit[] = [];
  for (const raw of root.hits) {
    const hit = record(raw);
    const entityType = text(hit?.entityType, 20);
    const identityId = uuid(hit?.identityId);
    const recordId = uuid(hit?.recordId);
    const displayName = text(hit?.displayName, 220);
    const secondaryLabel = text(hit?.secondaryLabel, 320);
    const status = text(hit?.status, 80);
    const matchField = text(hit?.matchField, 40);
    const maskedMatchValue = text(hit?.maskedMatchValue, 320);
    if ((entityType !== "CUSTOMER" && entityType !== "CHEF") || !identityId || !recordId || !displayName || !secondaryLabel || !status || !matchField || !maskedMatchValue) return null;
    hits.push({ entityType, identityId, recordId, displayName, secondaryLabel, status, matchField, maskedMatchValue });
  }
  return { correlationId, queryType, hits };
}

export function parseCustomerCase(value: unknown): CustomerCase | null {
  const root = record(value); const profile = record(root?.profile); const correlationId = uuid(root?.correlationId);
  const profileId = uuid(profile?.profileId); const identityId = uuid(profile?.identityId);
  const registeredPhoneNumber = text(profile?.registeredPhoneNumber, 30); const firstName = text(profile?.firstName, 120); const lastName = text(profile?.lastName, 120);
  if (!root || !profile || !correlationId || !profileId || !identityId || !registeredPhoneNumber || !firstName || !lastName || !Array.isArray(root.addresses) || root.addresses.length > 50) return null;
  const addresses: CustomerCase["addresses"] = [];
  for (const raw of root.addresses) {
    const a = record(raw); const addressId = uuid(a?.addressId); const addressLabel = text(a?.addressLabel, 30); const contactPhoneNumber = text(a?.contactPhoneNumber, 30); const addressLine1 = text(a?.addressLine1, 300); const city = text(a?.city, 160); const state = text(a?.state, 160); const defaultAddress = bool(a?.defaultAddress);
    if (!a || !addressId || !addressLabel || !contactPhoneNumber || !addressLine1 || !city || !state || defaultAddress == null) return null;
    addresses.push({ addressId, addressLabel, recipientName: nullableText(a.recipientName, 180), contactPhoneNumber, addressLine1, addressLine2: nullableText(a.addressLine2, 300), landmark: nullableText(a.landmark, 300), areaName: nullableText(a.areaName, 160), districtName: nullableText(a.districtName, 160), city, state, postalCode: nullableText(a.postalCode, 30), latitude: number(a.latitude), longitude: number(a.longitude), defaultAddress, createdAt: date(a.createdAt), updatedAt: date(a.updatedAt) });
  }
  return { correlationId, profile: { profileId, identityId, registeredPhoneNumber, firstName, lastName, email: nullableText(profile.email, 320), createdAt: date(profile.createdAt), updatedAt: date(profile.updatedAt) }, addresses };
}

export function parseChefCase(value: unknown): ChefCase | null {
  const root = record(value); const app = record(root?.application); const correlationId = uuid(root?.correlationId); const applicationId = uuid(app?.applicationId); const identityId = uuid(app?.identityId);
  const phoneNumber = text(app?.phoneNumber, 30); const email = text(app?.email, 320); const firstName = text(app?.firstName, 120); const lastName = text(app?.lastName, 120); const addressLine1 = text(app?.addressLine1, 300); const city = text(app?.city, 160); const state = text(app?.state, 160); const status = text(app?.status, 80);
  if (!root || !app || !correlationId || !applicationId || !identityId || !phoneNumber || !email || !firstName || !lastName || !addressLine1 || !city || !state || !status || !Array.isArray(root.documents) || root.documents.length > 100 || !Array.isArray(root.decisionHistory) || root.decisionHistory.length > 100) return null;
  const documents: ChefCase["documents"] = [];
  for (const raw of root.documents) { const d=record(raw); const documentId=uuid(d?.documentId); const documentType=text(d?.documentType,80); const originalFileName=text(d?.originalFileName,300); const contentType=text(d?.contentType,160); const fileSizeBytes=number(d?.fileSizeBytes); const documentStatus=text(d?.status,80); if(!d||!documentId||!documentType||!originalFileName||!contentType||fileSizeBytes==null||!documentStatus)return null; documents.push({documentId,documentType,originalFileName,contentType,fileSizeBytes,status:documentStatus,createdAt:date(d.createdAt),updatedAt:date(d.updatedAt)}); }
  const decisionHistory: ChefCase["decisionHistory"] = [];
  for (const raw of root.decisionHistory) { const d=record(raw); const auditId=uuid(d?.auditId); const adminIdentityId=uuid(d?.adminIdentityId); const decision=text(d?.decision,80); if(!d||!auditId||!adminIdentityId||!decision)return null; decisionHistory.push({auditId,adminIdentityId,decision,reason:nullableText(d.reason,500),createdAt:date(d.createdAt)}); }
  return { correlationId, application: { applicationId, identityId, phoneNumber, email, firstName, lastName, addressLine1, addressLine2: nullableText(app.addressLine2,300), landmark: nullableText(app.landmark,300), city, state, postalCode: nullableText(app.postalCode,30), latitude:number(app.latitude), longitude:number(app.longitude), status, rejectionReason:nullableText(app.rejectionReason,1000), submittedAt:date(app.submittedAt), reviewedAt:date(app.reviewedAt), reviewedByIdentityId: app.reviewedByIdentityId == null ? null : uuid(app.reviewedByIdentityId), createdAt:date(app.createdAt), updatedAt:date(app.updatedAt) }, documents, decisionHistory };
}
