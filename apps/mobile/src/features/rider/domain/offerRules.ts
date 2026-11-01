import type {OfferReason, OfferRules} from '../api/contract';
import type {RiderStrings} from '../strings/en';
import {formatKm} from './format';
import {nearerKm} from './homeSpot';

/**
 * Why this offer came to the rider, in one line (Phase 4, docs/riders/DISPATCH.md). It states the rule and the rider's
 * place, never what other riders did. Null when the server sent no reason or a rule this app doesn't know.
 */
export function whyOffer(reason: OfferReason | undefined, o: RiderStrings['offer']): string | null {
  if (!reason) {
    return null;
  }
  // "One of the 3 nearest" only when three were asked: the last riders of a round can be fewer.
  const together = Math.min(reason.atOnce, reason.riders);
  if (reason.rule === 'FAIR') {
    return together > 1 ? o.whyFairGroup(together) : o.whyFair;
  }
  if (reason.rule === 'SOONEST') {
    if (reason.round > 1) {
      return together > 1 ? o.whyNextSoonestGroup(together) : o.whyNextSoonest;
    }
    return together > 1 ? o.whySoonestGroup(together) : o.whySoonest;
  }
  if (reason.rule !== 'NEAREST') {
    return null;
  }
  if (reason.round > 1) {
    return together > 1 ? o.whyNextGroup(together) : o.whyNextNearest;
  }
  return together > 1 ? o.whyNearestGroup(together) : o.whyNearest;
}

/** A fair band in minutes when ranked by travel time: its metres at 20 km/h, to a tenth (the server's DispatchRules.bandMinutes). */
export function bandMinutes(bandM: number): number {
  return Math.max(0.1, Math.round((bandM * 3) / 100) / 10);
}

/** Phase 5: for a rider heading home, how much nearer home the drop leaves them; null otherwise. */
export function whyHome(reason: OfferReason | undefined, o: RiderStrings['offer']): string | null {
  return typeof reason?.homeNearerM === 'number' ? o.whyHome(nearerKm(reason.homeNearerM)) : null;
}

/** How orders are offered, as the lines of "How you get orders" in the rider's language. */
export function offerRulesLines(rules: OfferRules, t: RiderStrings['terms']): string[] {
  return [
    rules.offersAtOnce > 1 ? t.rulesAtOnce(rules.offersAtOnce, rules.offerSeconds) : t.rulesOneAtATime(rules.offerSeconds),
    rules.byTravelTime
      ? rules.fairBandM > 0
        ? t.rulesFairMinutes(bandMinutes(rules.fairBandM))
        : t.rulesSoonest
      : rules.fairBandM > 0
        ? t.rulesFair(formatKm(rules.fairBandM))
        : t.rulesNearest,
    ...(rules.offerRounds > 1 ? [t.rulesRounds(rules.offerRounds)] : []),
    t.rulesRadius(formatKm(rules.radiusM)),
    t.rulesFree,
    t.rulesWhy,
  ];
}
