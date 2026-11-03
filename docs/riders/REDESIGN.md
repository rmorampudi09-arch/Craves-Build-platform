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
| R-06 | Home: Today as rows (per online hour, fleet middle, trips) and "A quick selfie first" under Go online when the phone is set up. Earnings: Today / This week / Payouts chips, the total with trips, online time and per-hour line, the fleet line, the amber On hold card with "Add your side", trip rows "20:31 · kitchen to area / 4.0 km · wait ₹6 · tip ₹8.90", and the Monday payout line (bank last four, last payout with UTR, free withdrawal) from what the server has sent. Rules: a new "How you get orders" screen from Profile with the server's rules one per line, "Changes from <date>" only while `Terms.upcoming` waits, and the rate card and grievance officer links. Account under review: the notice screen as drawn (amber card, five lines that say when the server has not sent a field, the "if a pause…" card, Add your side, Call a person at Craves, the grievance link). | Main, HomeOffline, Earnings, Rules, AccountReview |
| R-05 | The trip as drawn: order title and "₹61 locked · kitchen" line, Ride to / Deliver to, rows (distance with minutes, food ready, hand over, pay for this trip), Navigate and Call, "Calls go through Craves" only with `features.maskedCalls` (off by default); at the kitchen the espresso card with "0BDE 0101", "Waiting since", the free-wait card and two ticks that never hold up Picked up; the hand-over with its "If Anil isn't answering" card and "Delivered is enabled once all 4 digits match"; Trip complete with the green header, the server's lines, "Your pay", the rate card and "Offer said at least ₹X", today's trips and online time. The server now sends `rateCardVersion`, `offerPayPaise`, both offer distances, `pickedUpAt` and `finishedAt`. | ToKitchen, AtKitchen, ToCustomer, Handover, TripComplete |
| R-04 | The foreground notification per step (`RiderTripNotice`, unit-tested): "To Lakshmi's Kitchen · order 0BDE 0101", one line, and Back to Craves, the step's action and SOS. A tapped action opens the app, which posts the step only while the trip screen shows that step; SOS opens the SOS screen. No new permission: it is the online service's own notification, redrawn. | MapsNotification |
| R-03 | "Reached <kitchen>?": the Kotlin service asks once the phone has been within 50 m of the kitchen for 20 s on TO_KITCHEN (`RiderReached`, a pure state machine with its own unit test). In the app it is the sheet as drawn; with Google Maps in front it is a heads-up with Yes and Not yet. Yes posts arrived-pickup; Not yet keeps quiet until the phone moves and stands still again. | ReachedPrompt |
| R-02 | The offer's map preview: Google Maps in lite mode through the rider flavor's own view (`RiderOfferMap.kt`), the kitchen pinned, the rider as a dot from the online service's last fix, the customer's area as a shaded 300 m circle on its centre, never the door. Only with the `RIDER_MAPS_API_KEY` secret in the build; without it the offer stays text rows and the app logs that once. The server now sends `kitchenName`, `pickupMinutes`, `kitchenAt` and `customerAreaAt` on every offer. | Offer |
| R-01 | The offer as drawn: kitchen name, pay first, the trip in rows (to the kitchen, kitchen to customer, food ready in, whole trip), why it came and "only you", "Not this one", "Saying no is free. Nothing is counted." A next-order offer shows the current trip on top and starts after its drop. New optional `Offer` fields: `kitchenName`, `pickupMinutes`, `foodReadyInMinutes`, `afterTrip`. | Offer, OfferNext |

R-02 to R-09 are added to this table as they land.

## Where the build differs from the canvas

- **R-01:** the canvas's map preview is R-02 (Google Maps lite mode); until then the offer shows the text rows only.
  The server's pay breakdown (`payLines`) stays as one small line under the pay sentence: the prompt keeps the server's
  numbers on screen. The seconds read "24s left", as before, not "24 s". The old item count and "Madhapur to Kondapur"
  line are gone (the canvas has neither; the rider sees the items at the kitchen). When the server sends no
  `kitchenName`, the title shows the kitchen's area instead ("New order · Madhapur"), so the area is never lost.
- **R-02:** the canvas's map shows "Kitchen", "Customer area" and "You" captions on the picture; lite mode draws no
  text, so the map is an image with one accessibility label and the rows under it carry the words. The customer area's
  centre is the drop rounded to a 0.005° cell (`shortcut:` in `FleetTripModels.areaCentre`), not a locality centroid.
  The native view could not be compiled here (no Android SDK): `build-rider-apk` in CI is the first build of it.
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
- **R-01 was written from the canvas, not from the `rider-redesign-R01.patch` file**, which was not available where this
  branch was built.
