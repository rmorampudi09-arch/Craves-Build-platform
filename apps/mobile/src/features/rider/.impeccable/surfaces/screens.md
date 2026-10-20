---
version: 1
slug: "screens"
primary_target: "screens"
related_targets: ["screens/AccountStatusScreen.tsx","screens/EarningsScreen.tsx","screens/HelpScreen.tsx","screens/HomeScreen.tsx","screens/OfferScreen.tsx","screens/PayoutsScreen.tsx","screens/PhoneSetupScreen.tsx","screens/ProfileScreen.tsx","screens/SosScreen.tsx","screens/TermsScreen.tsx","screens/TripDetailScreen.tsx","screens/TripScreen.tsx","components/BottomAction.tsx","components/RiderHeader.tsx","components/RiderRuntime.tsx","components/ui.tsx"]
---

## Scope and mode

- **Surface:** the Craves Rider app's 21 screens (`screens/*`) and their shared parts (`components/*`), from joining Craves, through going online and the trip, to getting paid, safety and account. The source is `docs/riders/designs/*.png`, and the build spec is `docs/riders/SCREENS.md`.
- **Mode: Operate.** The rider is in a task: accept an offer, collect, hand over, get paid. Familiar Android patterns and precision beat expression.
- **Platform:** native Android (React Native rider flavor). Material 3 behaviour applies: system Back, insets, 48 dp targets, font scale and TalkBack.
- **Visual authority is pinned by the supplied designs.** Build them. Do not explore new directions or add world material.

## Audience, job, task

- **Who:** a delivery rider in Hyderabad on a two-wheeler, phone in one hand, often in sun or rain, helmet on. The phone is a mid-range Xiaomi, Oppo, Vivo, Realme or Samsung. The rider reads English, Telugu or Hindi.
- **Jobs:**
  - get ready once (documents, terms, phone setup);
  - go online with a selfie;
  - judge an offer in 40 s from its locked pay and distances;
  - match the order code at the kitchen;
  - deliver against the customer's OTP, or follow the no-answer steps;
  - check pay, holds and payouts;
  - reach a person or SOS at any moment.
- **Success:** the rider never wonders what they will be paid, whether declining hurts them, what to do next, or how to get help.

## Proof and content

- **Content:** real rider data from the rider API only. Money comes in paise from the server, formatted with `formatRupees`. Times and timers derive from server timestamps.
- **Sample data:** the designs' sample data (Ravi, Lakshmi's Kitchen, Anil, CR-4107, amounts) is for previews and tests only.
- **Order code:** the production order code is the 8-character short order number.

## Constraints

- **Flat surfaces.** White, 1 dp `border` lines, no shadows (`elevation.none`).
- **Actions.** One `flameRedAccessible` primary action per screen, in the pinned bottom bar. Secondary actions are outline buttons with a `borderStrong` line.
- **Header.** Status chip plus a red SOS (`error`) on every working screen. The exceptions are sign-in, offer, selfie and the SOS screen itself.
- **No time pressure.** No customer ETA, delivery deadline, lateness warning or speed score.
- **No in-app map.** Navigate opens Google Maps in two-wheeler mode.
- **Timers.** Countdowns and timers live in leaf components.
- **Motion.** Only opacity and transform, at 200 ms or less, honouring reduce-motion.
- **States.** Every state is handled: loading, error, empty, offline/queued, permission denied, lost race. For the states that were never designed, see the list in SCREENS.md.
- **Accessibility.** Screens hold at 360–412 dp and font scale 1.3 in all three scripts. TalkBack labels on every control. Countdowns are announced at intervals.

## Direction contract

THESIS: A working tool that keeps its promises visibly. Pay is first and locked, declining is free, there is no clock on the rider, and a person decides. It refuses the category default of urgency red, ETA pressure and gamified streaks.

OWN-WORLD:
- **Surfaces and lines:** white surfaces, 1 dp #E3DDD8 lines, espresso #261A15 text, radius 14 (hero cards 20), no shadows.
- **Colour roles:**
  - flame red #D92714 only for the one primary action and red text links;
  - alarm red #C72C21 only for SOS;
  - soft success, warning and info fills for status and reassurance.
- **Type:** Roboto 400/700, with 900 reserved for offer pay (72) and the order code (60).

STORY: The rider sees what they will earn before committing, follows one obvious next step per screen, is reassured exactly where doubt arises ("Declining is free…", "You can keep working…"), and can always reach a human or SOS.

FIRST VIEWPORT, per working screen:
1. Header: title, status chip, and a 56×48 SOS at the right.
2. On trips, a 4-segment step bar.
3. The one decision-carrying element: pay hero, order-code card, OTP boxes, or the money total.
4. Supporting cards.
5. A pinned 56 dp primary action at the bottom.

FORM: Native Android app screens, pinned by the supplied 21-screen design PDF (first and only option on the list).
- seed: none (unavailable). The direction was pinned by the supplied designs, and no concept-seed roll was run.
- Signature move: the oversized locked numbers (72 sp offer pay, 60 sp order code, 72 dp OTP boxes) on an otherwise quiet surface.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved decisions

- **Placeholders:** [OPS PHONE], [COVER AMOUNT], and the state grievance portal link.
- **Hold vs notice dates:** Trip pay's "Decision by Mon 26 Oct" and Notice's "Tell us your side by Wed 28 Oct" refer to the same trip. Confirm the rule.
- **Undesigned states:** see SCREENS.md, "States not designed".
- **Selfie header:** whether the selfie screen gets the rider header and SOS (the design has none).
- **Error tone:** whether "Not accepted" keeps the error tone (the rule says error is SOS only).
