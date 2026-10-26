/**
 * Deterministic fake of everything the chef journey calls, installed with context.route().
 * Shapes are copied from craves.in responses captured on 12 Oct 2026 (build a655950) and
 * the parsers in src/features/chef-onboarding. All identities are synthetic.
 *
 * Unmatched /api calls answer 501 and are recorded; the fixture fails the test if any
 * happened, so a new endpoint can never make a test pass by accident or flake on a 404.
 */
import { test as base, expect, type BrowserContext, type Page, type Request, type Route } from "@playwright/test";

export const CHEF_ID = "0d9c3a52-5d1e-4c1a-9b8e-2f6a1c7e4b10";
export const APP_ID = "6a1f2e3d-4c5b-4a69-8778-9a8b7c6d5e4f";
export const PHONE = "9876543210";
const NOW = "2026-10-12T09:00:00.000Z";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

type Json = Record<string, unknown>;
// Request bodies are whatever the page sent; fields are read defensively.
type Body = { expectedVersion?: number; details?: Json; otp?: string; termsAccepted?: boolean } & Json | null;
type Fault = { method: string; path: string; kind: "abort" | "commit-then-abort" | number; times: number };

export class FakeBackend {
  identity = { id: CHEF_ID, phoneNumber: `+91${PHONE}`, email: "e2e.chef@example.invalid", emailVerified: true, displayName: null, status: "ACTIVE", roles: ["CUSTOMER"] as string[] };
  signedIn = false;
  bankEnrollmentRequired = false;
  version = 0;
  submitted = false;
  details: Json | null = null;
  documents: Json[] = [];
  application: Json = FakeBackend.emptyApplication();
  progressStatus = "DRAFT";
  kitchen: Json | null = null;
  calls: { method: string; path: string; body: unknown }[] = [];
  unmatched: string[] = [];
  private faults: Fault[] = [];
  private docSeq = 1;

  static emptyApplication(): Json {
    return { id: null, identityId: CHEF_ID, phoneNumber: `+91${PHONE}`, email: null, firstName: null, lastName: null, addressLine1: null, addressLine2: null, landmark: null, city: null, state: null, postalCode: null, latitude: null, longitude: null, status: "NOT_SUBMITTED", rejectionReason: null, submittedAt: null, reviewedAt: null, reviewedByIdentityId: null, documents: [], referenceCode: null };
  }

  /** A chef who already finished every section, ready to submit from Review. */
  completeDraft(): this {
    this.signedIn = true;
    this.version = 6;
    this.details = { email: this.identity.email, firstName: "E2E", lastName: "Chef", dateOfBirth: "1990-01-01", kitchenName: "E2E Test Kitchen", kitchenDescription: "Synthetic kitchen", addressLine1: "Flat 101", addressLine2: "KPHB Colony", landmark: null, city: "Hyderabad", state: "Telangana", postalCode: "500072", latitude: 17.4948, longitude: 78.4001, proofKind: "PAN", otherGovernmentId: null, fssaiNumber: "12345678901234", language: "en", proofHasBack: null };
    for (const type of ["KITCHEN_PHOTO_1", "KITCHEN_PHOTO_2", "SELECTED_PROOF_FRONT"]) this.addDocument(type, `${type.toLowerCase()}.jpg`);
    return this;
  }

  /** Submitted and approved, CHEF role granted: the state right after an admin approves. */
  approvedChef(): this {
    this.completeDraft();
    this.submitted = true;
    this.application = { ...this.application, id: APP_ID, status: "PENDING", submittedAt: NOW, referenceCode: "CRV-E2E01", firstName: "E2E", lastName: "Chef" };
    this.approve();
    return this;
  }

  /** What the admin "Approve" button does: status APPROVED and the CHEF role on the next refresh. */
  approve() {
    this.application = { ...this.application, status: "APPROVED", reviewedAt: "2026-10-12T10:00:00.000Z" };
    this.progressStatus = "APPROVED";
    this.identity.roles = ["CHEF", "CUSTOMER"];
  }
  reject(reason: string) {
    this.application = { ...this.application, status: "REJECTED", rejectionReason: reason, reviewedAt: "2026-10-12T10:00:00.000Z" };
    this.progressStatus = "REJECTED";
  }

  /** Next matching request fails. "commit-then-abort" saves first, then drops the response (a timeout the server survived). */
  fail(method: string, path: string, kind: Fault["kind"], times = 1) {
    this.faults.push({ method, path, kind, times });
  }

  callsTo(method: string, path: string) {
    return this.calls.filter((c) => c.method === method && c.path === path);
  }

  private addDocument(documentType: string, originalFileName: string): Json {
    this.documents = this.documents.filter((d) => d.documentType !== documentType);
    const doc = { id: uuid(this.docSeq++), documentType, originalFileName, contentType: "image/jpeg", fileSizeBytes: 2048, status: "UPLOADED", reviewReason: null, reviewedAt: null, createdAt: NOW, updatedAt: NOW, blobContainer: "documents", blobName: `kyc/${CHEF_ID}/${documentType}` };
    this.documents.push(doc);
    return doc;
  }

  private resumeStep(): string {
    const d = this.details ?? {};
    const has = (t: string) => this.documents.some((x) => x.documentType === t);
    if (this.submitted) return "waiting";
    if (!d.firstName || !d.dateOfBirth) return "personal";
    if (!d.kitchenName || !d.postalCode || d.latitude == null) return "kitchen";
    if (!has("KITCHEN_PHOTO_1") || !has("KITCHEN_PHOTO_2")) return "kitchen-photos";
    if (!d.fssaiNumber) return "fssai";
    if (!d.proofKind || !has("SELECTED_PROOF_FRONT")) return "documents";
    return "review";
  }

  state(): Json {
    const required = ["KITCHEN_PHOTO_1", "KITCHEN_PHOTO_2", "SELECTED_PROOF_FRONT"];
    if (this.details?.proofKind === "AADHAAR") required.push("SELECTED_PROOF_BACK");
    return {
      enabled: true, legacy: false, version: this.version, resumeStep: this.resumeStep(), submitted: this.submitted,
      phoneNumber: this.identity.phoneNumber, details: this.details, application: { ...this.application, documents: this.documents },
      documents: this.documents, requiredDocuments: required, supportPhone: "8000000000", supportEmail: "support@example.invalid",
      progress: { status: this.progressStatus, reason: null, nextAction: this.submitted ? "VIEW_STATUS" : "EDIT_APPLICATION", fssaiVerified: false, termsVersion: "craves-chef-terms-20261008-v1", sections: [] },
      bankEnrollmentRequired: this.bankEnrollmentRequired, callbackRequest: null,
    };
  }

  async install(context: BrowserContext) {
    // Playwright tries the most recently added route first, so the catch-all goes in first.
    await context.route("**/api/**", (route) => this.handle(route));
    // Firebase custom-token sign-in (after the OTP) talks to Google; answer it locally.
    await context.route(/identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com/, (route) => this.firebase(route));
    // Map tiles and static map images are decoration for these tests; failing fast keeps runs offline.
    await context.route(/\/api\/location\/(map-tiles|map-image)/, (route) => route.fulfill({ status: 404, body: "" }));
  }

  private async firebase(route: Route) {
    const url = route.request().url();
    const jwt = fakeIdToken(this.identity.id, this.identity.phoneNumber);
    if (url.includes("signInWithCustomToken")) return route.fulfill({ json: { kind: "identitytoolkit#VerifyCustomTokenResponse", idToken: jwt, refreshToken: "e2e-refresh", expiresIn: "3600", isNewUser: false } });
    if (url.includes("accounts:lookup")) return route.fulfill({ json: { users: [{ localId: this.identity.id, phoneNumber: this.identity.phoneNumber, lastLoginAt: "1791800000000", createdAt: "1791800000000" }] } });
    if (url.includes("securetoken")) return route.fulfill({ json: { access_token: jwt, expires_in: "3600", token_type: "Bearer", refresh_token: "e2e-refresh", id_token: jwt, user_id: this.identity.id, project_id: "craves-e2e" } });
    return route.fulfill({ status: 404, json: {} });
  }

  private async handle(route: Route) {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    const body = parseBody(req);
    this.calls.push({ method, path, body });

    const fault = this.faults.find((f) => f.method === method && path.startsWith(f.path) && f.times > 0);
    if (fault) {
      fault.times -= 1;
      if (fault.kind === "abort") return route.abort("timedout");
      if (typeof fault.kind === "number") return route.fulfill({ status: fault.kind, json: { code: "E2E_FAULT" } });
      await this.respond(method, path, body, req); // commit, then lose the answer
      return route.abort("timedout");
    }
    const res = await this.respond(method, path, body, req);
    if (!res) {
      this.unmatched.push(`${method} ${path}`);
      return route.fulfill({ status: 501, json: { code: "E2E_UNMOCKED", path } });
    }
    return route.fulfill({ status: res.status ?? 200, json: res.json });
  }

  private async respond(method: string, path: string, body: Body, req: Request): Promise<{ status?: number; json: unknown } | null> {
    const me = this.identity;
    const ok = (json: unknown, status = 200) => ({ status, json });
    const key = `${method} ${path}`;

    // --- session & sign-in
    if (key === "GET /api/version") return ok({ commitSha: "e2e" });
    if (key === "GET /api/auth/me") return this.signedIn ? ok(me) : ok({ code: "UNAUTHENTICATED" }, 401);
    if (key === "POST /api/auth/refresh") return this.signedIn ? ok({ identity: me, timing: { accessExpiresAt: Date.now() + 900_000, serverTime: Date.now(), sessionExpiresAt: null } }) : ok({ code: "UNAUTHENTICATED" }, 401);
    if (key === "POST /api/auth/otp/send") return ok({ challengeId: "e2eChallenge_".padEnd(43, "x"), expiresAt: Date.now() + 300_000, resendAvailableAt: Date.now() + 30_000 });
    if (key === "POST /api/auth/otp/verify") return body?.otp === "000000" ? ok({ code: "OTP_INVALID" }, 400) : ok({ firebaseCustomToken: "e2e.".padEnd(160, "t") });
    if (key === "POST /api/auth/session") { this.signedIn = true; return ok({ identity: me }); }
    if (key === "GET /api/customer/profile") return ok({}, 404);
    if (key === "GET /api/auth/email-verification") return ok({ email: me.email, emailVerified: me.emailVerified, emailRevision: 1, pending: null, serverTime: NOW });
    if (!this.signedIn) return ok({ code: "UNAUTHENTICATED" }, 401);

    // --- onboarding
    if (key === "GET /api/chef/application") return ok({ ...this.application, documents: this.documents });
    if (key === "GET /api/chef/onboarding") return ok(this.state());
    if ((method === "PUT" || method === "PATCH") && path === "/api/chef/onboarding") {
      if (body?.expectedVersion !== this.version) return ok({ code: "ONBOARDING_VERSION_CHANGED" }, 409);
      this.details = body.details ?? null;
      this.version += 1;
      return ok(this.state());
    }
    if (key === "POST /api/chef/application/proof-files") {
      const raw = req.postDataBuffer()?.toString("latin1") ?? "";
      const type = /name="documentType"\r\n\r\n([A-Z0-9_]+)/.exec(raw)?.[1] ?? "UNKNOWN";
      const name = /filename="([^"]+)"/.exec(raw)?.[1] ?? "upload.jpg";
      const doc = this.addDocument(type, name);
      return ok({ id: doc.id, documentType: type, originalFileName: name, contentType: "image/jpeg", fileSizeBytes: 2048, status: "UPLOADED", createdAt: NOW });
    }
    if (method === "DELETE" && path.startsWith("/api/chef/onboarding/documents/")) {
      if (body?.expectedVersion !== this.version) return ok({ code: "ONBOARDING_VERSION_CHANGED" }, 409);
      const id = path.split("/").pop();
      this.documents = this.documents.filter((d) => d.id !== id);
      this.version += 1;
      return ok(this.state());
    }
    if (method === "GET" && /^\/api\/chef\/onboarding\/documents\/[^/]+\/preview$/.test(path)) return ok({ url: "https://example.invalid/preview.jpg" });
    if (key === "GET /api/chef/onboarding/content") return ok([]);
    if (key === "POST /api/chef/onboarding/help") return ok({ id: "help-1", caseNumber: "CRV-HELP-1" });
    if (key === "POST /api/chef/onboarding/submit") {
      if (body?.expectedVersion !== this.version) return ok({ code: "ONBOARDING_VERSION_CHANGED" }, 409);
      if (body?.termsAccepted !== true) return ok({ code: "TERMS_REQUIRED" }, 400);
      const d = this.details ?? {};
      this.submitted = true;
      this.version += 1;
      this.progressStatus = "PENDING";
      this.application = { ...this.application, id: APP_ID, status: "PENDING", submittedAt: NOW, referenceCode: "CRV-E2E01", email: d.email, firstName: d.firstName, lastName: d.lastName, addressLine1: d.addressLine1, city: d.city, state: d.state, postalCode: d.postalCode, latitude: d.latitude, longitude: d.longitude };
      return ok(this.state());
    }
    if (key === "GET /api/chef-onboarding/bank") return ok({ id: null, state: "NOT_SUBMITTED", lastFour: null, ifsc: null, bankValidated: false, applicationApproved: this.application.status === "APPROVED", automaticActivation: true, accountHolderName: null, bankName: null, branchName: null, message: "Add your bank details once.", updatedAt: null });

    // --- location
    if (key === "POST /api/location/search") return ok({ results: [{ id: "e2e:kphb", title: "KPHB Colony Bus Stop", subtitle: "HMT Sathavahana Nagar, Kukatpally, Hyderabad, Telangana, 500072, India", formattedAddress: "KPHB Colony Bus Stop, HMT Sathavahana Nagar, Kukatpally, Hyderabad, Telangana, 500072, India", latitude: 17.4948, longitude: 78.4001, houseNumber: null, street: null, area: null, district: null, city: null, state: null, postalCode: null }] });
    if (key === "POST /api/location/reverse-geocode") return ok({ formattedAddress: "HMT Sathavahana Nagar, Kukatpally, Hyderabad, Telangana, 500072, India", houseNumber: null, street: null, area: "Kukatpally", city: "Hyderabad", district: "Medchal–Malkajgiri", state: "Telangana", postalCode: "500072", country: "India", confidence: "High", preciseHouseNumber: false });

    // --- approved chef app
    if (key === "GET /api/chef/kitchen") return ok(this.kitchen);
    if (key === "PUT /api/chef/kitchen") {
      this.kitchen = { id: uuid(900), kitchenName: "E2E Test Kitchen", displayName: "E2E Chef", description: "Synthetic kitchen", phoneNumber: me.phoneNumber, email: me.email, addressLine1: "Flat 101", addressLine2: "KPHB Colony", landmark: null, areaName: "Kukatpally", city: "Hyderabad", state: "Telangana", postalCode: "500072", latitude: 17.4948, longitude: 78.4001, status: "DRAFT", createdAt: NOW, updatedAt: NOW, ...(this.kitchen ?? {}), ...(body ?? {}) };
      return ok(this.kitchen);
    }
    if (key === "GET /api/chef/menu" || key === "GET /api/chef/orders" || key === "GET /api/chef/earnings") return ok([]);
    if (key === "GET /api/chef/orders/page") return ok({ orders: [], nextCursor: null, hasMore: false });
    if (key === "GET /api/chef/reviews") return ok({ items: [], nextCursor: null, hasMore: false });
    if (key === "GET /api/chef/subscription-plans") return ok([]);
    if (key === "GET /api/chef/scheduled-orders") return ok({ items: [], nextCursor: null, hasMore: false });
    if (key === "GET /api/chef/finance/balance") return ok({ accounting: { recordedOrders: 0, grossFood: "0.00", totalServiceFee: "0.00", feeBeforeGst: "0.00", feeGst: "0.00", withholding: "0.00", originalNetEarnings: "0.00", recordedPayments: "0.00", outstanding: "0.00", otherLedgerMovements: "0.00", legacyRecords: 0 }, available: "0.00", outstanding: "0.00", reservedOrPaid: "0.00", onHold: true, manualRequestUsedToday: false, nextManualRequestAt: "2026-10-12T18:30:00Z", recentPayouts: [], executionEnabled: false, payoutMode: "CRAVES_MANUAL" });
    if (key === "GET /api/chef/finance/withdrawals") return ok({ code: "FINANCE_OPERATION_NOT_FOUND" }, 404);
    if (key === "GET /api/documents/capabilities") return ok({ enabled: true, emailEnabled: true, types: ["CHEF_ORDER_STATEMENT", "CHEF_EARNINGS_STATEMENT", "CHEF_SETTLEMENT_STATEMENT"], maxPeriodDays: 31, maxRows: 1000, taxInvoicesEnabled: false });
    if (key === "GET /api/documents") return ok({ items: [], nextCursor: null });
    if (key === "GET /api/notifications/in-app") return ok([]);
    if (key === "GET /api/notifications/in-app/unread-count") return ok({ unreadCount: 0 });
    // No opening hours set: the kitchen is open or closed by its switch alone, as before hours existed.
    if (key === "GET /api/chef/kitchen/schedule") return ok({ kitchenId: (this.kitchen?.id as string) ?? uuid(900), timezoneId: "Asia/Kolkata", acceptingOrders: true, pausedUntil: null, pauseReason: null, weeklyWindows: [] });
    if (method === "GET" && path.startsWith("/api/chef/kitchen/schedule/overrides/")) return ok({ code: "SCHEDULE_OVERRIDE_NOT_FOUND" }, 404);
    if (key === "GET /api/chef/application/readiness") return ok({ contractVersion: 1, applicationStatus: this.application.status, emailStatus: "VERIFIED", approvalReady: false, requiredDocumentCount: 3, uploadedDocumentCount: 3, approvedDocumentCount: 3, documents: [], blockingIssues: [], evaluatedAt: NOW, lastSavedAt: NOW });
    if (key === "GET /api/chef/application/evidence-status") return ok(this.documents);
    if (key === "GET /api/chef/subscription-capacity") return ok({ chefIdentityId: CHEF_ID, adminSalesFrozen: false, freezeReason: null, slotRules: [], menuItemRules: [], dateOverrides: [], menuItemDateOverrides: [], openIncidentCount: 0 });
    if (key === "POST /api/chef/errors") return ok({}, 200);
    // The kitchen's public review summary (Profile's Reviews row): no reviews yet.
    if (method === "GET" && /^\/api\/reviews\/kitchens\/[^/]+\/summary$/.test(path)) return ok({ kitchenId: path.split("/")[4], reviewCount: 0, overallAverage: null });
    return null;
  }
}

function parseBody(req: Request): Body {
  if (!(req.headers()["content-type"] ?? "").includes("json")) return null;
  try { return req.postDataJSON(); } catch { return null; }
}

/** Unsigned JWT: the Firebase SDK decodes but never verifies ID tokens client-side. */
function fakeIdToken(uid: string, phone: string) {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: "https://securetoken.google.com/craves-e2e", aud: "craves-e2e", auth_time: now, user_id: uid, sub: uid, iat: now, exp: now + 3600, phone_number: phone, firebase: { identities: { phone: [phone] }, sign_in_provider: "custom" } })}.c2ln`;
}

/** Marks this device as having passed the chef OTP, the way chef-mode.ts does after sign-in. */
export async function rememberChefDevice(page: Page, userId = CHEF_ID) {
  await page.addInitScript((id) => {
    localStorage.setItem("craves.chef-device", JSON.stringify({ userId: id, verifiedAt: Date.now() }));
  }, userId);
}

export const test = base.extend<{ backend: FakeBackend }>({
  backend: async ({ context, page, baseURL }, provide, testInfo) => {
    const backend = new FakeBackend();
    await backend.install(context);
    // A device that already chose English; language.spec.ts clears this to test the language step itself.
    await context.addCookies([{ name: "craves_lang", value: "en", url: baseURL! }]);
    // 18+ rules and greetings depend on "today": pin it so the suite never drifts.
    await page.clock.install({ time: new Date("2026-10-12T09:00:00+05:30") });
    await provide(backend);
    if (backend.unmatched.length) await testInfo.attach("unmocked-api-calls", { body: backend.unmatched.join("\n") });
    expect(backend.unmatched, "every /api call the page made must be mocked").toEqual([]);
  },
});
export { expect };
