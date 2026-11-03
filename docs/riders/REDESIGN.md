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
- **R-01 was written from the canvas, not from the `rider-redesign-R01.patch` file**, which was not available where this
  branch was built.
