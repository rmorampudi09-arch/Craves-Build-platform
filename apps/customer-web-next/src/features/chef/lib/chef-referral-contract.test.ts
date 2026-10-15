import assert from "node:assert/strict";
import test from "node:test";
import {
  parseChefReferralEarnings,
  parseReferralCode,
  parseReferralEnrollment,
  parseReferralOverview,
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

test("referral overview: three level rows, member counts and pending paise, nothing else passed on", () => {
  const levels = [
    { level: 1, netEarnedPaise: "30000" },
    { level: 2, netEarnedPaise: "-500" },
    { level: 3, netEarnedPaise: "0" },
  ];
  const downline = [{ level: 1, members: "2" }];
  const overview = {
    asOf: "2026-10-15T04:00:00Z",
    currency: "INR",
    pendingPaise: "15000",
    levels,
    downline,
    onReviewHold: false,
  };
  const parsed = parseReferralOverview(overview);
  assert.deepEqual(parsed, { currency: "INR", pendingPaise: "15000", levels, downline });
  assert.deepEqual(parseReferralOverview(parsed), parsed);
  assert.deepEqual(parseReferralOverview({ ...overview, downline: [] })?.downline, []);
  for (const change of [
    { currency: "USD" },
    { pendingPaise: "-1" },
    { pendingPaise: 15000 },
    { levels: levels.slice(0, 2) },
    { levels: [levels[0], levels[0], levels[2]] },
    { levels: [levels[0], levels[1], { level: 4, netEarnedPaise: "0" }] },
    {
      downline: [
        { level: 1, members: "2" },
        { level: 1, members: "3" },
      ],
    },
    { downline: [{ level: 1, members: 2 }] },
    { downline: [{ level: 2, members: "1.5" }] },
    { downline: "none" },
  ])
    assert.equal(parseReferralOverview({ ...overview, ...change }), null, JSON.stringify(change));
});

test("chef referral earnings: amounts as paise strings whose sums agree", () => {
  const parsed = parseChefReferralEarnings(earnings);
  assert.equal(parsed?.netRecordedPaise, "40000");
  // The BFF sends the parsed reply on and the browser parses it again.
  assert.deepEqual(parseChefReferralEarnings(parsed), parsed);
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
