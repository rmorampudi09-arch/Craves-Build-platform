import {z} from 'zod';

export const uuid = z.string().uuid();
export const paise = z.string().regex(/^-?(0|[1-9]\d{0,18})$/).refine(value => {
  const n = BigInt(value), max = BigInt('9223372036854775807');
  return n >= -max && n <= max;
});
const positive = paise.refine(value => BigInt(value) >= BigInt(0));
const instant = z.string().datetime({offset: true});
export const referralOverview = z.object({
  asOf: instant, currency: z.literal('INR'), pendingPaise: positive, availablePaise: paise,
  reservedPaise: positive, balanceUpdatedAt: instant, onReviewHold: z.boolean(), spendingEnabled: z.boolean(),
  code: z.object({code: z.string().regex(/^[2-9A-HJ-NP-Z]{16}$/), link: z.string().url(), qrPath: z.literal('/api/v1/referrals/me/code/qr')}),
  levels: z.array(z.object({level: z.number().int().min(1).max(3), netEarnedPaise: paise})).length(3).refine(items => new Set(items.map(item => item.level)).size === 3),
  downline: z.array(z.object({level: z.number().int().min(1).max(3), members: positive})).max(3),
  cashout: z.object({enabled: z.boolean(), eligible: z.boolean(), reason: z.string().max(100), minimumPaise: positive}),
  policy: z.object({revision: positive, ratesBps: z.tuple([z.number().int(), z.number().int(), z.number().int()]), capBps: z.number().int().max(400), holdDays: z.number().int().min(1), minimumPaise: positive, customerBonusPaise: positive, inviteeDiscountPaise: positive, unusedShare: z.literal('retain')}).nullable(),
});
export const rewardsPage = z.object({items: z.array(z.object({id: uuid, track: z.enum(['UPLINE', 'CUSTOMER']), level: z.number().int().min(0).max(3), amountPaise: positive, reversedPaise: positive, netPaise: paise, status: z.enum(['PENDING', 'CREDITED', 'REVERSED', 'CANCELLED']), createdAt: instant, holdUntil: instant}).refine(item => BigInt(item.amountPaise) - BigInt(item.reversedPaise) === BigInt(item.netPaise) && BigInt(item.reversedPaise) <= BigInt(item.amountPaise))).max(100), nextCursor: z.string().max(512).nullable()});
export const cashout = z.object({id: uuid, amountPaise: positive, status: z.enum(['RESERVED', 'APPROVED', 'SUBMITTED', 'UNKNOWN', 'PAID', 'RELEASED']), requestedAt: instant});
export const cashoutsPage = z.object({items: z.array(cashout).max(100), nextCursor: z.string().max(512).nullable()});
export const attempt = z.object({id: uuid, amountPaise: positive});
export type ReferralOverview = z.infer<typeof referralOverview>;
export type RewardsPage = z.infer<typeof rewardsPage>;
export type CashoutsPage = z.infer<typeof cashoutsPage>;
export type WithdrawalAttempt = z.infer<typeof attempt>;
export function money(value: string): string {
  paise.parse(value); const n = BigInt(value), abs = n < BigInt(0) ? -n : n;
  const rupees = (abs / BigInt(100)).toString(), tail = rupees.slice(-3), head = rupees.slice(0, -3);
  const grouped = head ? `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${tail}` : tail;
  return `${n < BigInt(0) ? '-' : ''}₹${grouped}.${(abs % BigInt(100)).toString().padStart(2, '0')}`;
}
export function toPaise(value: string): string {
  if (!/^(0|[1-9]\d{0,16})(\.\d{1,2})?$/.test(value.trim())) { throw new Error('Enter rupees with no commas and at most two decimal places.'); }
  const [whole, fraction = ''] = value.trim().split('.');
  return positive.parse((BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'))).toString());
}
export function invitation(overview: ReferralOverview, origin = 'https://craves.in'): string {
  // An exact backend-created link is accepted, never an arbitrary deep link or redirect.
  if (overview.code.link !== `${origin}/r/${overview.code.code}` || !/^https:\/\/[^/?#@]+$/.test(origin)) { throw new Error('The invitation link could not be verified.'); }
  return overview.code.link;
}
export function qrPath(svg: unknown): string {
  if (typeof svg !== 'string' || svg.length > 1048576) { throw new Error('Invalid QR response.'); }
  const prefix = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="Your Craves referral QR code"><rect width="256" height="256" fill="white"/><path d="';
  const suffix = '" fill="black"/></svg>';
  if (!svg.startsWith(prefix) || !svg.endsWith(suffix)) { throw new Error('Invalid QR response.'); }
  const path = svg.slice(prefix.length, -suffix.length), command = /M(\d{1,3}) (\d{1,3})h1v1h-1z/g;
  let offset = 0, match: RegExpExecArray | null;
  while ((match = command.exec(path)) !== null) {
    if (match.index !== offset || Number(match[1]) > 255 || Number(match[2]) > 255) { throw new Error('Invalid QR coordinates.'); }
    offset = command.lastIndex;
  }
  if (offset !== path.length || offset === 0) { throw new Error('Invalid QR path.'); }
  return path; // Native rendering uses only these validated path commands, never remote SVG XML.
}
