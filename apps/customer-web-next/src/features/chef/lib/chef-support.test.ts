import assert from "node:assert/strict";
import test from "node:test";
import type { SupportCaseSummary } from "../../../shared/lib/support-cases-contract.ts";
import {
  displayPhone,
  supportPhoneFrom,
  ticketSubject,
  ticketBack,
  ticketSubtitle,
  ticketTopic,
} from "./chef-support.ts";

const now = new Date(2026, 9, 15, 14, 0);
const at = (hour: number, day = 15) => new Date(2026, 9, day, hour).toISOString();
const base: SupportCaseSummary = {
  id: "5a0c0000-0000-4000-8000-0000000000c1",
  caseNumber: "CRV-000000000987",
  requesterRole: "CHEF",
  orderId: null,
  subject: "Payout not received",
  status: "OPEN",
  lastRequesterMessageAt: at(10),
  lastSupportMessageAt: null,
  resolvedAt: null,
  closedAt: null,
  createdAt: at(10),
  updatedAt: at(10),
};

test("ticket subtitle says who wrote last, like the app", () => {
  assert.equal(ticketSubtitle(base, now), "You wrote · 4 hr ago");
  assert.equal(
    ticketSubtitle({ ...base, lastSupportMessageAt: at(12) }, now),
    "Craves replied · 2 hr ago",
  );
  assert.equal(
    ticketSubtitle({ ...base, lastSupportMessageAt: at(9) }, now),
    "You wrote · 4 hr ago",
  );
  assert.equal(
    ticketSubtitle({ ...base, lastRequesterMessageAt: null }, now),
    "You wrote · 4 hr ago",
  );
  assert.equal(
    ticketSubtitle({ ...base, status: "RESOLVED", resolvedAt: at(9, 14) }, now),
    "Solved · Yesterday",
  );
  assert.equal(
    ticketSubtitle({ ...base, status: "CLOSED", closedAt: at(9, 2) }, now),
    "Closed · 2 Oct",
  );
});

test("a ticket's subject is its topic and order number, within the 160 character limit", () => {
  assert.equal(
    ticketSubject("Problem with an order", "7f6392a6-1111-4111-8111-111111111111"),
    "Problem with an order · #7F6392A6",
  );
  assert.equal(ticketSubject(null, null), "General question");
  assert.equal(ticketSubject("x".repeat(200), null).length, 160);
});

test("only known topics come from the address bar", () => {
  assert.equal(ticketTopic("Delete my account"), "Delete my account");
  assert.equal(ticketTopic("Update a document"), "Update a document");
  assert.equal(ticketTopic("Update my documents"), "Update my documents");
  assert.equal(ticketTopic("Give me a refund"), null);
  assert.equal(ticketTopic(null), null);
});

test("Back returns to the page that opened the ticket, or to Help & support", () => {
  assert.deepEqual(ticketBack("/chef/documents"), {
    href: "/chef/documents",
    label: "Documents & verification",
  });
  assert.deepEqual(ticketBack("/chef/security"), {
    href: "/chef/security",
    label: "Login & security",
  });
  for (const from of [
    null,
    "https://evil.example",
    "//evil.example",
    "constructor",
    "/chef/orders",
  ])
    assert.deepEqual(ticketBack(from), { href: "/chef/support", label: "Help & support" });
});

test("the support number comes from onboarding, or falls back to today's number", () => {
  assert.equal(supportPhoneFrom({ supportPhone: "+919876543210" }), "+919876543210");
  for (const body of [null, {}, { supportPhone: "call us" }, { supportPhone: 98765 }])
    assert.equal(supportPhoneFrom(body), "+918367366787");
  assert.equal(displayPhone("+918367366787"), "+91 83673 66787");
  assert.equal(displayPhone("+4420"), "+4420");
});
