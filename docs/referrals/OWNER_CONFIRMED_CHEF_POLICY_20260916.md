# Confirmed chef referral policy — implementation checkpoint

This document records explicit owner answers, not financial activation or public-launch approval.

## Confirmed rules

- Chef-only rewards use the selling chef's food subtotal strictly above INR 250. Two INR 150 dishes in the same chef order qualify.
- Three levels receive 2%, 1.2% and 0.8%. Missing eligible levels do not redistribute their percentage.
- Total rewards cannot exceed 4%. Preserve nearest-paise rounding and existing excess trimming.
- Funding is Craves' existing commission. Do not deduct an additional referral charge from the selling chef's earnings. Insufficient verified commission must hold the event for reconciliation, not invent funding.
- Both paid and delivered are required. The later occurrence starts a 24-hour hold. Posting is at the first eligible 9 AM Asia/Kolkata run after the hold has elapsed.
- Monthly cap: INR 1,500 per receiving chef, using the India calendar month of actual posting. Ordinary sale earnings are not capped by this rule.
- Confirmed refund reversals restore allowance to the immutable original posting month, not the month in which the refund arrives.
- Customer bonuses, customer discounts and the old 14-day/INR 800 policy must remain inactive.

## Code and tests in this checkpoint

`services/referral-service/src/main/java/in/craves/referral/core/ChefReferralPolicy.java` expresses eligibility, integer-paise allocation, commission coverage, daily timing and accounting month rules without runtime activation or money writes.

`services/referral-service/src/test/java/in/craves/referral/ChefReferralPolicyTest.java` covers threshold boundaries, missing chef levels, 20,000 randomized rounding examples, commission shortfall, delayed payment, exact 9 AM boundaries, India month/year boundaries and refund allowance calculations.

Run with Java 21 from `services/referral-service`: `mvn -Dtest=ChefReferralPolicyTest,RewardMathTest test`.

## Still required before activation

The policy class is not yet wired to the reward worker. Authoritative chef eligibility/enrolment, immutable policy snapshots, serialized monthly-cap accounting, refund coupling and delivery into the existing chef earnings ledger remain required. Existing migrations V1–V8 are preserved; any database evolution must be additive. No balances, live rewards, customer bonuses, wallet spending or payouts have been created or enabled by this checkpoint.

A backlog or retry must never exceed a recipient's cap or double-post earnings. The implementation must retain immutable event identities and reconcile exact ledger entries. Genuine business/tax/terms and recipient evidence cannot be fabricated to satisfy a gate. No paid cloud testing budget has been approved.
