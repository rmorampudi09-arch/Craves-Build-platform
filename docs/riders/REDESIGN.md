# Rider app redesign (app 1.3.3, Nov 2026)

The canvas is the spec for layout and copy: https://claude.ai/artifact/TDt7xeJk5vR4AHi37FNB6N (26 artboards). The build
prompt of 3 Nov 2026 is the spec for behaviour; where they disagree the prompt wins, and this file says where.

## Shared language

From the canvas's side note, mapped to `apps/mobile/src/design/tokens.ts`:

| Canvas | Token |
|---|---|
| white ground | `colors.white` |
| warm ink #261A15 | `colors.espresso` (`textPrimary`) |
| flame red #F62E18, the one action and SOS only | `colors.flameRed` |
| deep red for small red text | `colors.flameRedAccessible` |
| warm grey cards #F6F1EE | `colors.surfaceMuted` |
| radius 14, 56 dp buttons, no shadows | `radius.lg`, `BottomAction`, no `elevation` |
| Roboto | the system font; nothing bundled |

The one 72 sp number (the offer's pay) and the 60 sp order code stay as `DESIGN.md` has them. Telugu, Hindi and
Kannada: every new key is in `strings/{en,te,hi,kn}.ts` under the same name (`strings.test.ts` enforces it); the
translations were written with the app, and wait for the P2-08 native-speaker review before those languages go live.

## The commits

| Commit | What | Artboards |
|---|---|---|
| R-09 | Policy 2026-11-v2 (`V184`): two flags on the dispatch policy, `joint_matching` and `next_order_offers`, shown to riders as two more lines of "How you get orders" (`OfferRules.jointMatching`, `nextOrderOffers`, present only when true) and in the upcoming-change line; before the first policy is published they join the draft, after it the policy riders see is copied as `2026-11-v2`, published 14 days ahead. Ops' new versions keep them. The dispatcher does not act on them yet. `RIDER_APP_VERSION` and the rider `versionName` to 1.3.3; `RIDER_APP_MIN_VERSION` and the server's `minAppVersion` unchanged. | TermsRateCard, Rules |
| R-08 | Removed from the app in 1.3.4. The Slots tab (fourth tab: Home, Slots, Earnings, Profile, in four languages): the days as chips, each window as Booked, Book or Full with the standby list, the wave note when a window is not open to this rider yet, the rules paragraph, and "Your slot now" on top while a booked slot runs. "Your slot now": the guarantee the minutes inside the zone cover so far, the bar, in-zone time of the window, the rate, and the settlement note. The app only asks the server (`GET /slots`, book, standby, cancel) and shows its answer or its refusal in the rider's words. | Slots, SlotNow |
| R-07 | Slots backend (integration-service): `V183__fleet_slot_booking.sql` (`slot_cluster`, `slot_capacity`, `slot_booking`, `slot_standby`, zone geometry on `rider_slot`, the slot rules in the rate card: the current draft, or `2026-11-v1` once a card is published); `FleetSlotBookingService` with the daily cluster job (0.01° cells, 2 orders an hour at lunch or dinner over 14 days, touching cells joined, 1500 m zone, an id that survives a move under 500 m, the orders' area as the name else "Cluster n"), the Monday 06:00 IST capacity job (places = ceil(expected / 1.4), ₹90 an hour inside the card's range and ₹60 to ₹150, `approved_at` null until ops approves), the rider API (`GET /rider/slots`, `POST /rider/slots/{capacity}/book`, `/standby`, `DELETE /rider/slots/bookings/{id}`), the Thursday and Friday 10:00 IST waves, 6 booked hours a day, standby promotion, no-shows (no shift 15 minutes in; two in 14 days lose the Thursday wave) and the ops console (`/admin/fleet/slot-capacity`: list, approve, set places or rate). A booking is a `rider_slot` row, so the existing heartbeat, settlement and money phase pay the guarantee; the heartbeat now counts only fixes inside a booked slot's circle. | Slots, SlotNow |
| R-06b | Sign in: the pitch, "Your mobile number", "We send a 6-digit code by SMS. No app fee, ever." and the agree line. Application: "Your application", "N of M approved" over the documents, the while-you-wait card with "Read the rate card". Terms: the 14-day line, the three plain paragraphs and "See how you get orders" (the Rules screen, reachable before approval too). Phone setup: "Make sure offers reach you", six counted settings with the test ring as its own card, and the footer line. Go online: the title and heading as drawn, "Not now, stay offline". Payouts: "Ready to pay out", "Past payouts", the failed-payout line. SOS: the flame-red screen with the white ops call, the espresso 112 call, the accident card and the ops line. Help: "A person answers", the hours line, "Riders ask most", the grievance card. Update required: "Please update the app before your next shift", the versions, "What is new". | SignIn, Documents, TermsRateCard, PhoneSetup, GoOnlineSelfie, Payouts, Sos, Help, UpdateRequired |
| R-06 | Home: Today as rows (per online hour, fleet middle, trips) and "A quick selfie first" under Go online when the phone is set up. Earnings: Today / This week / Payouts chips, the total with trips, online time and per-hour line, the fleet line, the amber On hold card with "Add your side", trip rows "20:31 · kitchen to area / 4.0 km · wait ₹6 · tip ₹8.90", and the Monday payout line (bank last four, last payout with UTR, free withdrawal) from what the server has sent. Rules: a new "How you get orders" screen from Profile with the server's rules one per line, "Changes from <date>" only while `Terms.upcoming` waits, and the rate card and grievance officer links. Account under review: the notice screen as drawn (amber card, five lines that say when the server has not sent a field, the "if a pause…" card, Add your side, Call a person at Craves, the grievance link). | Main, HomeOffline, Earnings, Rules, AccountReview |
| R-05 | The trip as drawn: order title and "₹61 locked · kitchen" line, Ride to / Deliver to, rows (distance with minutes, food ready, hand over, pay for this trip), Navigate and Call, "Calls go through Craves" only with `features.maskedCalls` (off by default); at the kitchen the espresso card with "0BDE 0101", "Waiting since", the free-wait card and two ticks that never hold up Picked up; the hand-over with its "If Anil isn't answering" card and "Delivered is enabled once all 4 digits match"; Trip complete with the green header, the server's lines, "Your pay", the rate card and "Offer said at least ₹X", today's trips and online time. The server now sends `rateCardVersion`, `offerPayPaise`, both offer distances, `pickedUpAt` and `finishedAt`. | ToKitchen, AtKitchen, ToCustomer, Handover, TripComplete |
| R-04 | The foreground notification per step (`RiderTripNotice`, unit-tested): "To Lakshmi's Kitchen · order 0BDE 0101", one line, and Back to Craves, the step's action and SOS. A tapped action opens the app, which posts the step only while the trip screen shows that step; SOS opens the SOS screen. No new permission: it is the online service's own notification, redrawn. | MapsNotification |
| R-03 | "Reached <kitchen>?": the Kotlin service asks once the phone has been within 50 m of the kitchen for 20 s on TO_KITCHEN (`RiderReached`, a pure state machine with its own unit test). In the app it is the sheet as drawn; with Google Maps in front it is a heads-up with Yes and Not yet. Yes posts arrived-pickup; Not yet keeps quiet until the phone moves and stands still again. | ReachedPrompt |
| R-02 | The offer's map preview: Ola tiles through the Craves proxy on MapLibre, the same map and the same `features/maps/olaMapTiles` helpers the customer app uses, so no map key ships in the app. The kitchen pinned, the rider as a dot from the online service's last fix, the customer's area as a shaded 300 m circle on its centre, never the door; nothing to tap. The server now sends `kitchenName`, `pickupMinutes`, `kitchenAt` and `customerAreaAt` on every offer. | Offer |
| R-01 | The offer as drawn: kitchen name, pay first, the trip in rows (to the kitchen, kitchen to customer, food ready in, whole trip), why it came and "only you", "Not this one", "Saying no is free. Nothing is counted." A next-order offer shows the current trip on top and starts after its drop. New optional `Offer` fields: `kitchenName`, `pickupMinutes`, `foodReadyInMinutes`, `afterTrip`. | Offer, OfferNext |

R-02 to R-09 are added to this table as they land.

## Where the build differs from the canvas

- **R-01:** the canvas's map preview is R-02 (Google Maps lite mode); until then the offer shows the text rows only.
  The server's pay breakdown (`payLines`) stays as one small line under the pay sentence: the prompt keeps the server's
  numbers on screen. The seconds read "24s left", as before, not "24 s". The old item count and "Madhapur to Kondapur"
  line are gone (the canvas has neither; the rider sees the items at the kitchen). When the server sends no
  `kitchenName`, the title shows the kitchen's area instead ("New order · Madhapur"), so the area is never lost.
- **R-02:** the canvas's map shows "Kitchen", "Customer area" and "You" captions on the picture; the map draws no
  text, so it is an image with one accessibility label and the rows under it carry the words. It is Ola Maps, not Google
  (Craves has an Ola key and no Google one; the customer app already draws Ola tiles through the proxy, with no key in
  the app). The customer area's centre is the drop rounded to a 0.005° cell (`shortcut:` in `FleetTripModels.areaCentre`),
  not a locality centroid.
- **R-03:** the sheet's "Food ready" row is R-05's (it needs the chef's ready time on the trip, shown there too). Demo
  (mock) builds have no geofence: the JS loop never asks, riders tap "I've reached the kitchen". GPS error is not added
  to the 50 m, and a fix without a speed counts as moving (both `shortcut:` comments in `RiderReached.kt`). Kotlin was
  not compiled here (no Android SDK): `build-rider-apk` runs `RiderReachedTest` with the other native tests.
- **R-04:** the canvas's "Food ready about 20:12" needs a chef's estimate the trip doesn't carry; the body says "The food
  is ready" once `chefReadyAt` is set, else "Tap Reached when you arrive." The notification redraws on the next
  `/locations` answer (up to 15 s on a trip), not the instant a step is tapped.
- **R-05:** no "Chef Lakshmi" row or line: the trip carries the kitchen's name, not the chef's. "Food ready about 20:12"
  is the time the chef marked the food ready (`chefReadyAt`), not an estimate; before that the row says the chef hasn't
  said. The hand-over header is the customer's first name (the canvas adds "Flat 304"; the full address is under it).
  "Paid on Monday" is the design's promise; the app shows it as drawn and the payout day stays the server's. The free-wait
  card keeps its countdown and words (the behaviour tests cover them) under the "Waiting since" line.
- **R-06:** Home keeps its greeting header, shift card, break and heading-home cards (their behaviour tests stand); the
  canvas's "Nearest kitchen is 0.6 km" hero and "This week" card need data `/home` does not send, so they are not built.
  Earnings rows show the kitchen's area, not its name (`TripEarning` has no name), and "wait 4 min" reads as the
  server's waiting pay ("wait ₹6"). The rules are the server's `OfferRules` lines, so a server without them shows one
  sentence saying so; the two rules the canvas adds (shared-out orders, next-order offers) come with R-09's policy text.
  "Add your side, with photos" takes words only, as before: photos on a notice are not in this PR.
- **R-06b:** the canvas's "You can go online with 4 of 6" does not match what blocks going online here (location and
  notifications, two of the six), so the line says "2 of 6" and names them. "Google Maps installed" is not a check (no
  reliable way to ask on Android 11+ without a manifest query), and the lock-screen setting stands in its place. SOS has
  no "Share my location with a family member": there is no server path for it. The selfie screen keeps "Ops checks it's
  you. Customers never see this photo." rather than the canvas's 30-day deletion line, which is not a rule this code
  enforces. The application's "Expected answer: <date>" needs a date the server does not send. "Download 1.3.3" needs a
  download URL the app does not have: the update screen keeps Call support. Profile stays as R-06 left it ("Rider since"
  and the document validity rows need fields `/profile` does not send).
- **R-09:** the two 2026-11-v2 lines are terms text only: `FleetDispatcher` ignores the flags (joint matching and
  next-order offers are a later PR), ops cannot set or see them from the admin API (`DispatchPolicyInput` and
  `DispatchPolicyVersion` are unchanged; every new version keeps them as riders see them), and there is no dispatch
  policy named 2026-11-v1 in the migrations: the copy takes the timers of whatever policy riders are shown at deploy.
- **R-08:** "Your slot now" has no "Trip pay in this slot" or "Top-up if you stay" lines and no "End this slot early"
  button: the slots contract carries the covered guarantee only, and ending a slot early is ops' action (the existing
  admin cancel), not the rider's. "About 2 orders an hour per rider" is not shown: the server plans places from it but
  does not send it to riders. The day chips read "Today", then weekday and date, in the phone's time zone like every
  clock in the app.
- **R-07:** before any rate card is published (a fresh database, the pilot not live) the three slot lines join the
  current draft's summary and no version is spent; once a card is published, the migration copies the card riders see
  into `2026-11-v1`, PUBLISHED, starting 14 days after the deploy, so `Terms.upcoming` carries the slot rules only in the
  second case. GOPI: say which it is. The cluster name is the commonest pickup area
  the orders carry (there is no locality table), else "Cluster n". The ops console is the three admin endpoints; the web
  app has no fleet admin pages to add a screen to. Tests use the repository's disposable Postgres (`FleetDatabase`), as
  every fleet database test does; Testcontainers is not a dependency here and was not added for this.
- **R-01 was written from the canvas, not from the `rider-redesign-R01.patch` file**, which was not available where this
  branch was built.

## R1 redesign (app 1.4.0, Nov 2026)

The rider app moved to its own look, built from the clickable prototype (project docs `rider-app/REDESIGN-2026-11-13.md`
and `rider-app/research/R17-ui-ux-redesign.md`); `apps/mobile/src/features/rider/DESIGN.md` "Redesign R1" has the
detail. In short: a rider-only theme (`features/rider/theme.ts`) with Day by default and Night by choice, Barlow and
Barlow Condensed (bundled in the rider flavor only), surface cards on a warm ground, peach kitchen and mint customer
panels, a named route strip, slide-to-confirm for the three trip steps, a code board with "Show to chef", the app's own
OTP keypad, a light selfie screen, and a payout row on Home. The customer and chef apps are untouched
(`design/tokens.ts` is unchanged). Not built yet: the earnings "How it adds up" breakdown, which needs the server to
send it.

