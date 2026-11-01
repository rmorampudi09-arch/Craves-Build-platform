Gopi must confirm every part marked "(inferred)" below before anyone relies on it.

# Product

<!-- impeccable:product-schema 1 -->

## Platform

android

## Users
- **Primary:** Craves delivery riders ("delivery partners") in Hyderabad, starting with 5–10 known riders in one kitchen area during the pilot. Each rider works booked slots (for example lunch, or 7–10 pm) on a two-wheeler, usually their own scooter.
- **Device and conditions:** mid-range Android phones (Xiaomi, Oppo, Vivo, Realme, Samsung), held one-handed, often in sun or rain, sometimes while wearing a helmet.
- **The job:** go online, accept or decline an offer within 40 s, collect a sealed bag from a home kitchen by matching an order code, hand it over against the customer's OTP (or follow the customer-not-answering steps), and see and withdraw what they earned.
- **Languages:** English, Telugu and Hindi. Terms, offers and pay statements must exist in all three; the full app in Telugu and Hindi comes later.
- **Secondary:** Craves ops staff, who review documents and selfies, decide holds and disputes, and answer rider support and SOS calls. They use the admin console, not this app.

## Product Purpose
- **What it is:** the rider flavor of the Craves mobile app. It lets Craves run its own small delivery fleet for orders from home chefs, tried first for up to 60 s before falling back to Borzo, Pidge, then an ops queue.
- **Success for the rider:**
  - offers ring reliably even with the screen off;
  - the pay for an offer is known and locked before accepting;
  - every trip ends in a clear, credited amount;
  - money arrives on time (weekly payout plus one free withdrawal a day).
- **Pilot exit criteria (operational):**
  - first-offer acceptance ≥ 70%;
  - median time to accept ≤ 20 s;
  - offer-to-ring p95 under 5 s;
  - zero payout errors and zero stranded orders.

## Positioning
Craves treats riders as partners under written, published terms. The rider sees:
- an absolute rate card;
- pay locked per offer;
- declines that cost nothing and never affect future offers;
- no delivery deadline shown, and lateness that never changes pay;
- a person, never the app, deciding holds and disputes, in writing with reasons;
- 14 days' notice before pay or rules change;
- no fees, deposits, kit costs or penalties.

These follow Telangana's gig-worker Act (Act 21 of 2026) and set Craves apart from competing rider apps in Hyderabad (inferred framing from PLAN.md's risk table).

## Operating Context
- **Joining:** phone OTP sign-in; manual document checks by ops (no DigiLocker); a background check; then in-person training, a ride-along, and a free bag and T-shirt.
- **Phone setup:** a one-time checklist (location, notifications, battery, autostart, lock in recent apps, a test ring), with per-manufacturer steps.
- **Shift:** go online with a selfie (ops checks identity; customers never see it), then wait at a kitchen rest point. Waiting in a booked slot is paid at a guaranteed hourly minimum.
- **Trip:** offer (40 s) → to kitchen → at kitchen (order code, sealed bag, free-wait timer then waiting pay) → to customer → OTP handover, or the customer-not-answering flow (two calls, a wait timer, photo drop-off; pay may be held for ops review).
- **Navigation** happens in the Google Maps app (two-wheeler mode). The rider app shows addresses and landmarks, not a map.
- **Money:** pay is credited at handover and withdrawable after 24 hours. A weekly payout goes out every Monday by 3 pm to UPI or bank, plus one free withdrawal a day, each with a bank reference (UTR).
- **Safety:** SOS on every working screen (call Craves ops, call 112) and 24×7 group accident cover.

## Capabilities and Constraints
- **Stack:**
  - React Native (bare RN 0.85 with Expo modules), as a rider product flavor of `apps/mobile` with its own applicationId, plus one Kotlin foreground service for location, offer ringing and heartbeat.
  - Shared design tokens in `apps/mobile/src/design/tokens.ts`; shared components in `apps/mobile/src/shared/components`.
  - Roboto (the system font).
- **Backend:** a fleet package in integration-service. All money comes from the server in paise. The app never computes pay.
- **Distribution:** Firebase App Distribution for the pilot, then the Play Store.
- **Not in the pilot:** in-app map, masked calling, slot booking, instant cash-out, two orders per trip, dark mode (not designed).
- **Placeholders still open:** [OPS PHONE], [COVER AMOUNT], the state grievance portal link. The rate card is a draft ("Draft pricing, not final").
- **Order code:** the real code is the 8-character short order number (e.g. "#0BDE0101"); "CR-4107" in the designs is a placeholder.

## Brand Commitments
- **Name:** "Craves Riders".
- **Colour and type:** the mobile app's own tokens, with flame red `flameRed` #F62E18 (the Craves brand red, as in the Craves app) for primary buttons (white bold labels on it), red links, the active tab and the countdown, and espresso #261A15 for text, set in Roboto. The web design system (Manrope/Inter, #E5342A) is not used for rider screens.
- **Voice:** plain, short, reassuring and specific. Controls name their action. The app says what it will and won't do with the rider's money, data and photo.

## Evidence on Hand
- **Designs:** 21 screens in `docs/riders/designs/*.png`, with the build spec in `docs/riders/SCREENS.md`.
- **Product docs:** in the craves-riders project, `rider-app/PLAN.md`, `RIDER-PLAYBOOK.md`, `SCREENS-DESIGN.md` and research reports R1–R12.
- **Sample data only:** Ravi Kumar, Lakshmi's Kitchen, Anil and all amounts. Do not present them as real riders, customers or earnings.
- **No testimonials, rider counts or earnings claims exist.** Do not invent them.

## Product Principles
1. **Pay first, locked, from the server.** The rider sees what they get before they commit, and the number never changes afterwards.
2. **No pressure on time.** No customer ETA, deadline, lateness warning or speed score in the rider's view.
3. **Declining is free.** Nothing in the UI punishes or nudges against a decline or an expired offer.
4. **A person decides.** Holds, disputes and deactivations are explained in writing with reasons and dates, and the rider can always reach a human.
5. **Safety beats flow.** SOS is one tap away on every working screen and never asks for confirmation.

## Accessibility & Inclusion
- **Font scale:** screens must fit at Android font scale 1.3 (PLAN.md A11), including in Telugu and Hindi.
- **Touch targets:** 48 dp minimum, primary actions 56 dp; usable one-handed and with gloves (inferred).
- **TalkBack:** labels on all controls; countdowns announced at intervals, not every second.
- **Contrast:** text at 4.5:1 or better, readable in direct sunlight (inferred from the use scene).
