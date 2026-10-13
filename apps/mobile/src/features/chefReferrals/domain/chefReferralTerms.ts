/**
 * The chef referral terms, v1 (12 Oct 2026), as plain text for the terms sheet.
 * Same wording as docs/referrals/CHEF_REFERRAL_TERMS_V1.md; the version the server checks is
 * CHEF_REFERRAL_TERMS_VERSION in chefReferralEnrollApi.ts. Change both together, never one.
 */
export const CHEF_REFERRAL_TERMS: readonly {title: string; body: string}[] = [
  {
    title: 'Who can take part.',
    body: 'Any home chef with an active Craves account can join. Rewards are paid only to chefs who are approved to sell on Craves and whose account is active and not under review.',
  },
  {
    title: 'How you get linked.',
    body: "A new chef is linked to the chef who invited them only when they create their Craves account through that chef's referral link and accept these terms. The link is fixed at sign-up and can never be changed or added later. Existing accounts can join the programme, but without a referrer.",
  },
  {
    title: 'No fee, no purchase.',
    body: 'Joining is free. Nobody has to pay, buy anything or recruit anyone to take part. Rewards come only from real food sales.',
  },
  {
    title: 'What you earn.',
    body: "When a chef you referred sells food on Craves, you earn a share of that chef order's food subtotal (before taxes, delivery and other charges):\n• 2% for a chef you referred directly,\n• 1.2% for a chef they referred,\n• 0.8% for one more level down.\nOnly chef orders with a food subtotal of ₹250 or more count. If a level has no eligible chef, that share is not paid to anyone else.",
  },
  {
    title: 'Who pays.',
    body: "Rewards come out of Craves' own commission. Nothing is ever deducted from the selling chef's earnings.",
  },
  {
    title: 'When it is credited.',
    body: 'An order counts once it is both paid and delivered. After a 24-hour hold, the reward is credited at the next 9 AM (India time) run.',
  },
  {
    title: 'Monthly limit.',
    body: 'Each chef can earn at most ₹1,500 in referral rewards per calendar month (India time). Rewards above the limit are not carried over to later months.',
  },
  {
    title: 'Refunds.',
    body: 'If an order is refunded, the matching reward is reversed. The reversal counts against the month in which the reward was first credited.',
  },
  {
    title: 'How you are paid.',
    body: 'Referral rewards are added to your Craves chef earnings and paid out the same way as your food sales, including any holds or bank checks that apply to your earnings. Tax may be deducted where the law requires it.',
  },
  {
    title: 'Fair use.',
    body: 'Self-referrals, duplicate or fake accounts, and orders placed by you or the people above you in your own referral line are not eligible. Craves may hold or reverse rewards and close accounts involved in misuse.',
  },
  {
    title: 'Your data.',
    body: 'To prevent misuse, Craves stores a one-way hashed form of your phone number. A referral link is remembered for up to 30 days in a signed form until the invited chef signs up.',
  },
  {
    title: 'Changes.',
    body: 'Craves may change or end the programme with notice in the app. Rewards already credited stay credited.',
  },
  {
    title: 'Customers.',
    body: 'This programme is for chefs only. It gives no customer bonus, wallet credit or discount.',
  },
];
