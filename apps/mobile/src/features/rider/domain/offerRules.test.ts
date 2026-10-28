// Phase 4: why an offer came to the rider, and the rules for how orders are offered, in the rider's words.
import type {OfferReason} from '../api/contract';
import {en} from '../strings/en';
import {hi} from '../strings/hi';
import {te} from '../strings/te';
import {offerRulesLines, whyOffer} from './offerRules';

const nearest: OfferReason = {rule: 'NEAREST', place: 1, riders: 4, atOnce: 1, round: 1};

describe('whyOffer', () => {
  it('states the rule and the place, never what other riders did', () => {
    expect(whyOffer(nearest, en.offer)).toBe("You're the nearest free rider.");
    expect(whyOffer({...nearest, round: 2}, en.offer)).toBe("You're the next nearest free rider.");
    expect(whyOffer({...nearest, atOnce: 3, place: 2}, en.offer)).toBe(
      "You're one of the 3 nearest free riders. The first to accept gets it.",
    );
    expect(whyOffer({...nearest, atOnce: 3, round: 2}, en.offer)).toBe(
      "You're one of the next 3 nearest free riders. The first to accept gets it.",
    );
    expect(whyOffer({...nearest, rule: 'FAIR', bandM: 1500, bandRiders: 2, earnedPerHourPaise: 0}, en.offer)).toBe(
      "Fair turns: free riders near the kitchen who have earned less per online hour today hear first. It's your turn.",
    );
    expect(whyOffer({...nearest, rule: 'FAIR', atOnce: 2}, en.offer)).toMatch(/It's your turn: 2 riders hear at once/);
  });

  it('counts only the riders actually asked together, and says nothing it cannot back', () => {
    expect(whyOffer({...nearest, atOnce: 3, riders: 1}, en.offer)).toBe("You're the nearest free rider.");
    expect(whyOffer({...nearest, atOnce: 3, riders: 2}, en.offer)).toMatch(/^You're one of the 2 nearest/);
    expect(whyOffer(undefined, en.offer)).toBeNull();
    expect(whyOffer({...nearest, rule: 'SOMETHING_NEW' as never}, en.offer)).toBeNull();
  });

  it('speaks Telugu and Hindi too', () => {
    expect(whyOffer(nearest, te.offer)).toBe(te.offer.whyNearest);
    expect(whyOffer({...nearest, atOnce: 3}, hi.offer)).toBe(hi.offer.whyNearestGroup(3));
  });
});

describe('offerRulesLines', () => {
  it("words today's rules and fair turns, one line each", () => {
    expect(offerRulesLines({offersAtOnce: 3, offerRounds: 1, offerSeconds: 40, radiusM: 5000, fairBandM: 0}, en.terms)).toEqual([
      'Each order goes to 3 riders at once. You get 40 seconds, and the first to accept gets it.',
      'Nearest first: the free riders closest to the kitchen hear first.',
      'Only riders within 5.0 km of the kitchen hear of an order.',
      'Declining or missing an offer is free. Your acceptance rate and ratings never decide who gets an order.',
      'Each offer says why it came to you.',
    ]);
    const fair = offerRulesLines({offersAtOnce: 1, offerRounds: 3, offerSeconds: 30, radiusM: 4000, fairBandM: 1500}, en.terms);
    expect(fair.slice(0, 3)).toEqual([
      'Each order goes to one rider at a time. You get 30 seconds to decide.',
      'Fair turns: among the free riders within 1.5 km of the nearest, the one who has earned the least per online hour today hears first. If two have earned the same, the one who has waited longest goes first.',
      'If a rider passes or the time runs out, the next rider hears, in up to 3 rounds.',
    ]);
    expect(offerRulesLines({offersAtOnce: 1, offerRounds: 3, offerSeconds: 30, radiusM: 4000, fairBandM: 1500}, te.terms)[1]).toContain('1.5 km');
  });
});
