import { describe, expect, it } from "vitest";
import { matchFleetRoute } from "./fleet-common";
import {
  detourChanges, dispatchForm, dispatchFromForm, dispatchPolicySchema, draftFromForm, fleetSetupSchema, fromUnitText, pilotKitchenSchema, pilotNoteSchema,
  pilotRiderSchema, rateCardDraftSchema, rateCardForm, rateCardSchema, SETUP_ROUTES, toUnitText, versionState,
} from "./setup-contract";

const RIDER = "11111111-1111-4111-8111-111111111111";
const CHEF = "33333333-3333-4333-8333-333333333333";
const at = "2026-10-22T04:30:00Z";
const NOW = Date.parse(at);
const policy = {
  version: "2026-10-v2", status: "PUBLISHED", effectiveFrom: at, publishedAt: at, mode: "shadow", offerSeconds: 40, fleetStageSeconds: 60, radiusM: 5000,
  pickupDetourPercent: 130, perOrderOverheadPaise: 500, costGuardPremiumPaise: 1000, pidgeStageSeconds: 600,
  ranges: { offerSeconds: [30, 60], fleetStageSeconds: [45, 120], radiusM: [1000, 10000], pickupDetourPercent: [100, 200], perOrderOverheadPaise: [0, 3000], costGuardPremiumPaise: [0, 3000], pidgeStageSeconds: [300, 900] },
};
const card = {
  version: "2026-10-v1", status: "DRAFT", effectiveFrom: "2026-11-03T18:30:00Z", basePaise: 4000, baseDropM: 2000, dropPerKmPaise: 900, pickupFreeM: 1000,
  pickupPerKmPaise: 900, waitFreeMinutes: 8, waitPerMinutePaise: 150, slotGuaranteePerHourPaise: 8000, cancellationFeePaise: 2000, returnPerKmPaise: 900, unreachableWaitMinutes: 10,
  ranges: {
    basePaise: [3000, 6000], baseDropM: [1000, 3000], dropPerKmPaise: [600, 1500], pickupFreeM: [0, 2500], pickupPerKmPaise: [0, 1500], waitFreeMinutes: [5, 10],
    waitPerMinutePaise: [100, 300], slotGuaranteePerHourPaise: [0, 15000], cancellationFeePaise: [0, 5000], returnPerKmPaise: [0, 1500], unreachableWaitMinutes: [5, 15],
  },
  summaryOfChanges: { en: ["First version of the Craves rider terms."] },
};
const setup = {
  testMode: true, dispatchPolicy: policy, dispatchPolicies: [policy], rateCard: null, rateCards: [card],
  pilotRiders: [{ riderId: RIDER, name: "Ravi Kumar", status: "ACTIVE", note: "Madhapur", addedAt: at }], pilotKitchens: [{ chefId: CHEF, addedAt: at }],
};

describe("pilot setup parsers", () => {
  it("accept the contract shape and drop unknown fields", () => {
    const parsed = fleetSetupSchema.parse({ ...setup, zone: "Madhapur", rateCards: [{ ...card, published_by: "x" }] });
    expect(parsed.rateCards[0]).toEqual(card);
    expect(parsed.dispatchPolicy).toEqual(policy);
    expect(parsed.pilotKitchens).toEqual([{ chefId: CHEF, addedAt: at }]);
    expect(rateCardSchema.parse({ ...card, status: "PUBLISHED", publishedAt: at, summaryOfChanges: { en: ["a"], te: ["b"], hi: null }, fullTextUrl: "https://craves.in/terms" }).summaryOfChanges.te).toEqual(["b"]);
    expect(pilotRiderSchema.parse({ riderId: RIDER, name: "Ravi", status: "SUSPENDED", addedAt: at }).note).toBeUndefined();
  });

  it("refuse a missing in-force field, a bad version, mode or id, and rupees instead of paise", () => {
    expect(fleetSetupSchema.safeParse({ ...setup, rateCard: undefined }).success).toBe(false);
    for (const version of ["v2", "2026-10", "2026-10-v", "2026-10-v1 "]) expect(dispatchPolicySchema.safeParse({ ...policy, version }).success, version).toBe(false);
    expect(dispatchPolicySchema.safeParse({ ...policy, mode: "on" }).success).toBe(false);
    expect(dispatchPolicySchema.safeParse({ ...policy, perOrderOverheadPaise: 5.5 }).success).toBe(false);
    expect(rateCardSchema.safeParse({ ...card, status: "ACTIVE" }).success).toBe(false);
    expect(rateCardSchema.safeParse({ ...card, basePaise: -1 }).success).toBe(false);
    expect(pilotKitchenSchema.safeParse({ chefId: "chef-1", addedAt: at }).success).toBe(false);
  });

  it("send a pilot note, or no body for an empty one", () => {
    expect(pilotNoteSchema.parse(undefined)).toBeUndefined();
    expect(pilotNoteSchema.parse({ note: " Madhapur " })).toEqual({ note: "Madhapur" });
    expect(pilotNoteSchema.safeParse({ note: "x".repeat(201) }).success).toBe(false);
  });

  it("route versions only by their shape", () => {
    expect(matchFleetRoute(SETUP_ROUTES, "POST", ["rate-cards", "2026-10-v12", "publish"])?.route.path).toBe("rate-cards/:version/publish");
    expect(matchFleetRoute(SETUP_ROUTES, "POST", ["rate-cards", RIDER, "publish"])).toBeNull();
    expect(matchFleetRoute(SETUP_ROUTES, "DELETE", ["pilot", "kitchens", CHEF])?.ids).toEqual([CHEF]);
    expect(matchFleetRoute(SETUP_ROUTES, "DELETE", ["pilot", "kitchens", "2026-10-v1"])).toBeNull();
  });
});

describe("units", () => {
  it("show paise as rupees and metres as km, and read them back as integers", () => {
    expect([toUnitText("rupees", 4000), toUnitText("rupees", 150), toUnitText("rupees", 5), toUnitText("km", 2000), toUnitText("km", 1250), toUnitText("km", 5500), toUnitText("percent", 130)])
      .toEqual(["40.00", "1.50", "0.05", "2", "1.25", "5.5", "130"]);
    expect(["5.5", "0.1", "2.25", "10", " 3 "].map(text => fromUnitText("km", text))).toEqual([5500, 100, 2250, 10000, 3000]);
    expect(["40", "1.5", "0.05"].map(text => fromUnitText("rupees", text))).toEqual([4000, 150, 5]);
    expect(["", "1.2345", "-1", "1e3", "5,5"].map(text => fromUnitText("km", text))).toEqual([null, null, null, null, null]);
    expect(["40.5", "", "-4", "1e2"].map(text => fromUnitText("seconds", text))).toEqual([null, null, null, null]);
  });
});

describe("dispatch form", () => {
  const form = dispatchForm(dispatchPolicySchema.parse(policy));

  it("prefills in human units and sends the same values back at once", () => {
    expect(form).toMatchObject({ mode: "shadow", radiusM: "5", perOrderOverheadPaise: "5.00", costGuardPremiumPaise: "10.00", pickupDetourPercent: "130", effectiveFrom: "" });
    expect(dispatchFromForm({ ...form, mode: "live", radiusM: "4.5", costGuardPremiumPaise: "12.5" }, dispatchPolicySchema.parse(policy), NOW)).toEqual({
      mode: "live", offerSeconds: 40, fleetStageSeconds: 60, radiusM: 4500, pickupDetourPercent: 130, perOrderOverheadPaise: 500, costGuardPremiumPaise: 1250, pidgeStageSeconds: 600,
    });
    expect(dispatchFromForm({ ...form, offerSeconds: "40.5" }, null, NOW)).toBe("Enter a number for “Time a rider has to accept, seconds”.");
    expect(dispatchFromForm({ ...form, perOrderOverheadPaise: "five" }, null, NOW)).toBe("Enter a number for “Overhead per order, ₹”, like 40 or 40.50.");
  });

  it("needs a start 14 days ahead only when the detour changes", () => {
    const reference = dispatchPolicySchema.parse(policy);
    const changed = { ...form, pickupDetourPercent: "140" };
    expect(detourChanges(form, reference)).toBe(false);
    expect(detourChanges(changed, reference)).toBe(true);
    // The first policy ever has nothing to compare with.
    expect(detourChanges(changed, null)).toBe(false);
    expect(dispatchFromForm(changed, null, NOW)).not.toHaveProperty("effectiveFrom");
    expect(dispatchFromForm(changed, reference, NOW)).toBe("A new detour can start 14 days from now at the earliest. Pick a later start.");
    // 22 Oct 10:00 IST + 14 days = 5 Nov 10:00 IST.
    expect(dispatchFromForm({ ...changed, effectiveFrom: "2026-11-05T09:59" }, reference, NOW)).toBe("A new detour can start 14 days from now at the earliest. Pick a later start.");
    expect(dispatchFromForm({ ...changed, effectiveFrom: "2026-11-05T10:00" }, reference, NOW)).toMatchObject({ pickupDetourPercent: 140, effectiveFrom: "2026-11-05T04:30:00.000Z" });
  });
});

describe("rate card draft form", () => {
  const filled = { ...rateCardForm(rateCardSchema.parse(card)), effectiveFrom: "2026-11-05T10:00", en: " Base pay goes up to ₹45. \n\n Waiting is paid after 7 minutes. " };

  it("prefills from the newest version, ranges included", () => {
    expect(rateCardForm(rateCardSchema.parse(card))).toMatchObject({ basePaise: "40.00", baseDropM: "2", waitPerMinutePaise: "1.50", waitFreeMinutes: "8", en: "", effectiveFrom: "" });
    expect(rateCardForm(rateCardSchema.parse(card)).ranges.baseDropM).toEqual(["1", "3"]);
    expect(rateCardForm(null).basePaise).toBe("");
    expect(rateCardForm(rateCardSchema.parse({ ...card, ranges: {} })).ranges.basePaise).toEqual(["", ""]);
  });

  it("builds the body in paise and metres, with ranges only for the first card", () => {
    const later = draftFromForm({ ...filled, basePaise: "45", te: "", hi: " हिंदी \n" }, false);
    expect(later).toEqual({
      ...Object.fromEntries(Object.entries(card).filter(([key]) => /Paise$|M$|Minutes$/.test(key))), basePaise: 4500,
      effectiveFrom: "2026-11-05T04:30:00.000Z", summaryOfChanges: { en: ["Base pay goes up to ₹45.", "Waiting is paid after 7 minutes."], hi: ["हिंदी"] },
    });
    expect(rateCardDraftSchema.safeParse(later).success).toBe(true);
    const first = draftFromForm({ ...filled, fullTextUrl: " https://craves.in/rider-terms " }, true);
    expect(first).toMatchObject({ fullTextUrl: "https://craves.in/rider-terms", ranges: { ...card.ranges } });
  });

  it("names the first problem", () => {
    expect(draftFromForm({ ...filled, basePaise: "40.505" }, false)).toBe("Enter a number for “Base pay, ₹”, like 40 or 40.50.");
    expect(draftFromForm({ ...filled, ranges: { ...filled.ranges, baseDropM: ["3", "1"] } }, true)).toBe("The lowest “Drop distance in the base pay, km” is above the highest.");
    expect(draftFromForm({ ...filled, ranges: { ...filled.ranges, waitFreeMinutes: ["5", ""] } }, true)).toBe("Enter the lowest and highest “Free waiting, minutes”.");
    expect(draftFromForm({ ...filled, effectiveFrom: "" }, false)).toBe("Pick when the rate card starts.");
    expect(draftFromForm({ ...filled, en: " \n " }, false)).toBe("Write at least one English summary line.");
    expect(draftFromForm({ ...filled, en: Array(11).fill("Line").join("\n") }, false)).toBe("Write at most 10 English summary lines.");
    expect(draftFromForm({ ...filled, te: "x".repeat(201) }, false)).toBe("Keep each Telugu line to 200 characters.");
    expect(draftFromForm({ ...filled, fullTextUrl: "http://craves.in/terms" }, false)).toBe("Enter the full terms link as https://…");
  });
});

describe("version state", () => {
  it("names drafts, the version in force, scheduled and replaced versions", () => {
    const inForce = { version: "2026-10-v2" };
    expect(versionState({ version: "2026-10-v3", status: "DRAFT", effectiveFrom: at }, inForce, NOW)).toBe("Draft");
    expect(versionState({ version: "2026-10-v2", status: "PUBLISHED", effectiveFrom: at }, inForce, NOW)).toBe("In force");
    expect(versionState({ version: "2026-11-v1", status: "PUBLISHED", effectiveFrom: "2026-11-05T04:30:00Z" }, inForce, NOW)).toBe("Scheduled");
    expect(versionState({ version: "2026-10-v1", status: "PUBLISHED", effectiveFrom: "2026-10-01T04:30:00Z" }, null, NOW)).toBe("Replaced");
  });
});
