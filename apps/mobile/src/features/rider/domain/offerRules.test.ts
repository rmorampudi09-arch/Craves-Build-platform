// Phase 4: why an offer came to the rider, and the rules for how orders are offered, in the rider's words.
import type {OfferReason} from '../api/contract';
import {en} from '../strings/en';
import {hi} from '../strings/hi';
import {te} from '../strings/te';
import {bandMinutes, offerRulesLines, whyHome, whyOffer} from './offerRules';

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

  it('says soonest, not nearest, when riders are ranked by travel time (Phase 5)', () => {
    const soonest: OfferReason = {...nearest, rule: 'SOONEST'};
    expect(whyOffer(soonest, en.offer)).toBe('Of the free riders, you can reach the kitchen soonest.');
    expect(whyOffer({...soonest, round: 2}, en.offer)).toBe('Of the free riders, you can reach the kitchen next soonest.');
    expect(whyOffer({...soonest, atOnce: 3}, en.offer)).toBe(
      "You're one of the 3 free riders who can reach the kitchen soonest. The first to accept gets it.",
    );
    expect(whyOffer({...soonest, atOnce: 2, round: 3}, te.offer)).toBe(te.offer.whyNextSoonestGroup(2));
  });
});

describe('whyHome', () => {
  it('says how much nearer home the drop leaves a rider heading home, and nothing otherwise', () => {
    expect(whyHome({...nearest, homeNearerM: 3240}, en.offer)).toBe('On your way home: the drop leaves you 3.2 km nearer home.');
    expect(whyHome({...nearest, homeNearerM: 3240}, te.offer)).toBe(te.offer.whyHome('3.2'));
    expect(whyHome(nearest, en.offer)).toBeNull();
    expect(whyHome(undefined, hi.offer)).toBeNull();
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

  it('words ranking by travel time, with a fair band in minutes as the server counts it', () => {
    const rules = {offersAtOnce: 1, offerRounds: 1, offerSeconds: 40, radiusM: 5000, fairBandM: 0, byTravelTime: true};
    expect(offerRulesLines(rules, en.terms)[1]).toBe(
      "Soonest first: the free riders who can reach the kitchen soonest hear first, by Craves's travel-time estimate. Without an estimate, the nearest hear first.",
    );
    expect(offerRulesLines({...rules, fairBandM: 1000}, en.terms)[1]).toMatch(/^Fair turns: among the free riders who can reach the kitchen within 3 minutes of the soonest/);
    expect(offerRulesLines({...rules, fairBandM: 1500}, en.terms)[1]).toContain('within 4.5 minutes of the soonest');
    expect(offerRulesLines({...rules, fairBandM: 333}, en.terms)[1]).toContain('within 1 minute of the soonest');
    expect(offerRulesLines({...rules, fairBandM: 1000}, hi.terms)[1]).toBe(hi.terms.rulesFairMinutes(3));
    expect([bandMinutes(1), bandMinutes(300), bandMinutes(1000), bandMinutes(1234), bandMinutes(5000)]).toEqual([0.1, 0.9, 3, 3.7, 15]);
  });
});
