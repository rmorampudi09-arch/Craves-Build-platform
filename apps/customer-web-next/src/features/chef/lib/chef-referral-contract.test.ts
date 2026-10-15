import assert from "node:assert/strict";
import test from "node:test";
import {
  parseChefReferralEarnings,
  parseReferralCode,
  parseReferralEnrollment,
  referralRupees,
} from "./chef-referral-contract.ts";
import { CHEF_REFERRAL_TERMS } from "./chef-referral-terms.ts";

const earnings = {
  currency: "INR",
  asOf: "2026-10-15T04:00:00Z",
  creditedPaise: "45000",
  reversedPaise: "5000",
  netRecordedPaise: "40000",
  postingMonth: "2026-10",
  monthlyCapPaise: "150000",
  monthUsedPaise: "40000",
  monthRemainingPaise: "110000",
  monthlyCapReached: false,
  settlementDestination: "CHEF_EARNINGS",
  withdrawalAvailability: "CHECK_VERIFIED_CHEF_EARNINGS_BALANCE",
  recentPostings: [
    {
      id: "11111111-2222-4333-8444-555555555555",
      amountPaise: "-5000",
      postingMonth: "2026-10",
      postedAt: "2026-10-14T03:30:00Z",
    },
    {
      id: "11111111-2222-4333-8444-666666666666",
      amountPaise: "45000",
      postingMonth: "2026-10",
      postedAt: "2026-10-13T03:30:00Z",
    },
  ],
};

test("referral code: only the service's code alphabet and an https link", () => {
  const link = "https://craves.in/r/ABCDEFGH23456789";
  assert.deepEqual(
    parseReferralCode({ code: "ABCDEFGH23456789", link, qrPath: "/api/v1/referrals/me/code/qr" }),
    { code: "ABCDEFGH23456789", link },
  );
  for (const bad of [
    { code: "ABCDEFGH2345678", link },
    { code: "ABCDEFGH2345678O", link },
    { code: "ABCDEFGH23456789", link: "http://craves.in/r/x" },
    { code: "ABCDEFGH23456789", link: "javascript:alert(1)" },
    { code: "ABCDEFGH23456789", link: "not a url" },
    null,
  ])
    assert.equal(parseReferralCode(bad), null);
});

test("chef referral earnings: amounts as paise strings whose sums agree", () => {
  const parsed = parseChefReferralEarnings(earnings);
  assert.equal(parsed?.netRecordedPaise, "40000");
  assert.equal(parsed?.recentPostings[0].amountPaise, "-5000");
  for (const change of [
    { netRecordedPaise: "45000" },
    { monthRemainingPaise: "100000" },
    { monthUsedPaise: "160000", monthRemainingPaise: "0", monthlyCapReached: true },
    { monthlyCapReached: true },
    { creditedPaise: "-1" },
    { creditedPaise: 45000 },
    { currency: "USD" },
    { postingMonth: "2026-13" },
    { recentPostings: [{ ...earnings.recentPostings[0], id: "x" }] },
    { recentPostings: Array.from({ length: 51 }, () => earnings.recentPostings[1]) },
  ])
    assert.equal(
      parseChefReferralEarnings({ ...earnings, ...change }),
      null,
      JSON.stringify(change),
    );
  assert.ok(
    parseChefReferralEarnings({
      ...earnings,
      monthUsedPaise: "150000",
      monthRemainingPaise: "0",
      monthlyCapReached: true,
    }),
  );
});

test("enrolment answer and money words", () => {
  assert.equal(
    parseReferralEnrollment({ accepted: true, status: "QUEUED", userId: "x" }),
    "QUEUED",
  );
  assert.equal(
    parseReferralEnrollment({ accepted: true, status: "ALREADY_ENROLLED" }),
    "ALREADY_ENROLLED",
  );
  assert.equal(parseReferralEnrollment({ accepted: false, status: "QUEUED" }), null);
  assert.equal(parseReferralEnrollment({ accepted: true, status: "DONE" }), null);
  assert.equal(referralRupees("45000"), "₹450.00");
  assert.equal(referralRupees(150000), "₹1,500.00");
});

test("the terms are v1 in full: 13 clauses with the v1 numbers", () => {
  assert.equal(CHEF_REFERRAL_TERMS.length, 13);
  const text = CHEF_REFERRAL_TERMS.map((term) => term.body).join("\n");
  for (const fact of [
    "2% for a chef you referred directly",
    "1.2%",
    "0.8%",
    "₹250 or more",
    "24-hour hold",
    "9 AM (India time)",
    "₹1,500",
  ])
    assert.ok(text.includes(fact), fact);
});
