# Craves Rider: screen build spec (21 screens)

Source: the 21-page design PDF ("Craves Rider app screens"), rendered at 2x to `designs/NN-Name.png`. Every number below was read from those PNGs: copy from the PDF text layer and checked against the image, colours sampled from pixels and matched to `apps/mobile/src/design/tokens.ts`, sizes measured in pixels and divided by 2.

- **Units.** dp for layout, sp for type, both equal to PNG px / 2 on the 390 dp frame. Measurements are within about 1 dp.
- **Weights.** 700 means bold. In the designs, Roboto shows only three weights: 400, 700 and 900. The shared components' `fontWeight.semibold` ('600') renders as Roboto Bold on Android, so 600 and 700 look the same.
- **Colours** are tokens.ts names (`colors.X`). There is no raw hex in this file, except where no token exists, and those places are flagged.
- **Sample data.** Ravi Kumar, Lakshmi's Kitchen, Anil, CR-4107 and all amounts are sample data. Every amount comes from the API in paise and is formatted with `formatRupees`.

---

## 0. Shared pieces (build once, reuse on every screen)

### 0.1 Screen
- Background `colors.white`. Horizontal content padding 16 (`spacing.md`).
- First content element sits 16 below the header's bottom border.
- Vertical gap between stacked cards and blocks: 16 (`spacing.md`). Exception: phone-setup step cards use 12 (`spacing.sm`).
- The body scrolls. The bottom action bar and tab bar are pinned.
- Use safe-area insets (react-native-safe-area-context). The 844 dp frames exclude the system bars.

### 0.2 Rider header (variants A, B, C)
- **Common:** height 68 for variant A, 64 for B and C. White, 1 dp bottom border `colors.border`, padding 16 left and right.
- **SOS button (all variants):**
  - Size 56 wide × 48 tall, right edge at 16 from the screen edge, vertically centred.
  - Fill `colors.error`, radius 14 (`radius.md`).
  - Label "SOS" 16/800 `colors.white` (measured weight looks extra-bold; use `fontWeight.extrabold`).
  - Opens screen 18. Accessibility label: "SOS, emergency help".
- **Variant A (title + status chip):** used on 02, 03, 04, 05, 07, 09–13, 15 and 20.
  - Title 19/700 `colors.textPrimary` at top 10.
  - Status chip below it at y 36–60.
- **Variant B (chip only):** used on 14. Status chip vertically centred at y 22–44, no title.
- **Variant C (back + title):** used on 16, 17, 19 and 21.
  - Back icon `chevron-left` 24 `colors.textPrimary`, glyph at x≈24, with a 48 × 48 hit area.
  - Title 19/700 starting at x 56.
  - No status chip.
- **No header:** 01, 06, 08 and 18.

### 0.3 Status chip
- Height 24, pill (`radius.pill`), 1 dp border. Left padding 12, then an 8 dp dot, gap 6, label 13/700 `colors.textPrimary`, right padding 12.
- **Neutral:** fill `colors.white`, border `colors.border`, dot `colors.textSecondary`. Copy: "Offline" or "Not active yet".
- **Live:** fill `colors.successSoft`, border `colors.success`, dot `colors.success`. Copy: "Online · waiting for orders" or "Trip · step N of 4" (the separator is a middle dot ·).

### 0.4 Trip step bar (4 segments)
Used on 09–12, not on 13.
- Directly under the header: 12 dp gap above, 16 dp gap below.
- 4 equal segments across the 358 dp content width with a 4 dp gap, each about 86.5 dp wide.
- Height 4, pill ends.
- Done and current segments are `colors.textPrimary`; upcoming segments are `colors.border`.
- Accessibility: one element, label "Trip step N of 4".

### 0.5 Bottom action bar
- White, 1 dp top border `colors.border`, padding 16 all round.
- Buttons stacked with an 8 dp gap; full width (358).
- When there is a tab bar, the action bar sits directly above it.

### 0.6 Tab bar (05, 07, 15, 20 only)
- Height 64, 1 dp top border `colors.border`, three equal tabs: Home, Earnings, Profile.
- Each tab: icon 24 above label 13/700.
- **Active:** icon and label `colors.flameRedAccessible`. **Inactive:** `colors.textSecondary`.
- Icons are outline glyphs: `home-outline`, `wallet-outline`, `account-outline`.
- Use `Icon` with `surface={false}`. No icon tiles anywhere in rider screens.

### 0.7 Cards

| Kind | Fill | Border | Radius | Padding | Used for |
|---|---|---|---|---|---|
| **Card** | `colors.white` | 1 dp `colors.border` | 14 (`radius.md`) | 16 | Default container. No shadow (`elevation.none`). |
| **Hero card** | `colors.white` | 1 dp `colors.textPrimary` | 20 (`radius.lg`) | 16 (order code: 20 top and bottom) | Order code (10), Withdraw (17), Talk to a person (21). |
| **Attention card** | `colors.white` | 1 dp `colors.textPrimary` | 14 | 16 | A step that still needs the rider (04, pending items). |

- In the content area, text inside a card starts at x 33: 16 screen padding + 1 border + 16 card padding.
- Card-with-leading-icon (02, 07, 17): icon 24 at the card padding, text block starting 34 dp from the card's left edge (icon 24 + gap 10).
- Never nest a card in a card. Inner banners (0.8) are the only fill inside a card.

### 0.8 Banners (soft fills, no border, radius 14)

| Tone | Fill | Text and icon | Used on |
|---|---|---|---|
| warning | `colors.warningSoft` | `colors.warningText` | 01, 05, 16 |
| success | `colors.successSoft` | `colors.successText` | 05 (inner), 07 (inner), 13, 18, 19 |
| neutral | `colors.muted` | `colors.textPrimary` | 11, 13 |

- **Outer banner (full width):** padding 16, leading icon 24, text starts 50 dp from the banner's left edge, text 15/400.
- **Inner banner (inside a card):** padding 12, icon 24, text starts 42 dp from its edge.
- `colors.info` is used only by the "Checking" badge. `colors.error` is used only for SOS (header button, screen 18) and the "Not accepted" badge on 02.

### 0.9 Badges (pills)
- **Standard:** height 24, padding 10 left and right, label 13/700. Used for documents, "Near drop point", "On hold" on 16, and "Draft pricing, not final".
- **Compact:** height 20, padding 8 left and right, label 12/700 (12 is not a tokens.ts size: add a rider constant or use `typography.small`). Used in trip and payout rows on 15 and 17.
- **Tones** (same as `Badge`):
  - success: `colors.successSoft` / `colors.successText`
  - warning: `colors.warningSoft` / `colors.warningText`
  - info: `colors.infoSoft` / `colors.infoText`
  - error: `colors.errorSoft` / `colors.error`
- The shared `Badge` uses minHeight 28 and padding 12. Use it with a style override, or accept 28.

### 0.10 Buttons (all radius 14, no shadow)

| Variant | Height | Fill / border | Label | Notes |
|---|---|---|---|---|
| **primary** | 56 | `colors.flameRedAccessible` | 16/700 `colors.white` | Optional left icon 20 white. The shared `Button` primary adds `elevation.primaryAction`: override to `elevation.none`. |
| **primary-offer** | 64 | as primary | 19/700 | "Accept" on 08 only. |
| **sos-call** | 72 | `colors.error` | 19/700 white | Phone icon 24, on 18. |
| **outline** | 56 | `colors.white`, 1 dp `colors.borderStrong` | 16/700 `colors.textPrimary` | Optional left icon 24 `colors.textPrimary`. The shared `Button` outline uses a flameRed border and red label, which does not match the design. |
| **outline-strong** | 72 | 1 dp `colors.textPrimary` | two lines: 19/700 + 13/700 `colors.textSecondary` | "Call 112" on 18. |
| **outline-compact** (in-card) | 48 | 1 dp `colors.borderStrong` | 15/700 `colors.textPrimary` | Used for "Upload again", "Open autostart settings", "I've locked it", "Upload new policy", "Call for a claim", "Open the riders' WhatsApp group". |
| **locked** (disabled) | 56 | `colors.muted`, no border | 16/700 `colors.textSecondary` | Lock icon 20 `colors.textSecondary`. The shared `Button` disabled state is opacity 0.48, which does not match. |
| **text link, red** | min 48 hit area | none | `colors.flameRedAccessible` | Underlined: "Change number" (15/400 inline), "Customer not answering?" (16/700). Not underlined: "Ring again" (15/700), "Report a problem with this trip" (16/700), "Report a problem" on 17 (15/700). |
| **text link, neutral** | min 48 hit area | none | 15/700 `colors.textSecondary`, centred | "Sign out", "Resend code in 24s". |

- Two-up rows (09, 10, 11): two outline buttons, 12 dp gap, each 173 dp wide.

### 0.11 Rows
- **Rate / pay row:**
  - Label 15/400 `colors.textSecondary` takes the remaining width.
  - Value 15/700 `colors.textPrimary`, right aligned, may wrap.
  - Terms (03): rows separated by 1 dp `colors.border` dividers inside the card padding, single-line row pitch 39.
  - Pay breakdowns (14, 16): no dividers, pitch 26.
- **Key–value row (order card):** label 15/400 `colors.textSecondary`, value 15/700 `colors.textPrimary`, pitch 28, no dividers.
- **Document row:**
  - Title 15/400 `colors.textPrimary`; optional sub 13/400 `colors.textSecondary`; standard badge right-aligned to the title.
  - Rows separated by 1 dp `colors.border` dividers that are inset to the card padding.
  - Optional reason text 15/400 `colors.textPrimary` and an outline-compact button under it.
- **List row, full-bleed (15):** 69 tall.
  - Left: title 15/700 and sub 13/400 `colors.textSecondary`.
  - Right: amount 15/700 with a compact badge below it.
  - 1 dp `colors.border` dividers across the full 390 width.
- **Nav row (15, 20, 21):**
  - Height 48 (15) or about 53 (20, 21).
  - Label 15 `colors.textPrimary` (700 on 15, 400 on 20 and 21).
  - `chevron-right` 24 at the right.
  - On 15 it is a standalone 1 dp `colors.borderStrong` box, radius 14. On 20 and 21 the rows sit in a card with 1 dp `colors.border` dividers across the full card width.

### 0.12 Circles, bars, chips
- **Step circles, 28 dp:**
  - Done: fill `colors.success` with a white `check` 16.
  - Current: 2 dp ring `colors.textPrimary`, numeral 13/700 `colors.textPrimary`.
  - Locked: 2 dp ring `colors.borderStrong`, numeral 13/700 `colors.textSecondary`.
  - Not started (04): 2 dp ring `colors.borderStrong`, empty.
  - Text starts 12 dp after the circle.
- **Numbered list circle (19):** 24 dp, fill `colors.textPrimary`, numeral 13/700 white, text 12 dp after.
- **Progress bars** (pill ends, track `colors.muted`; animate fill with `transform: scaleX`, not width):

| Bar | Height | Fill | What it shows | Screen |
|---|---|---|---|---|
| offer countdown | 8 | `colors.flameRedAccessible` | remaining time (shrinks) | 08 |
| setup progress | 8 | `colors.success` | done / total | 04 |
| free-wait timer | 6 | `colors.textPrimary` | elapsed (grows) | 10 |

- **Language chips (03, 20):**
  - Height 40 visual. Give a hitSlop so the target is 48, or use `Chip`'s minHeight 48.
  - Pill, padding about 16, gap 8.
  - Selected: fill `colors.textPrimary`, label 15/700 white.
  - Unselected: white, 1 dp `colors.borderStrong`, label 15/400 `colors.textPrimary`.
  - The shared `Chip` selected state uses flameRedAccessible fill, which does not match.
  - Labels: "English", "తెలుగు", "हिन्दी" (each in its own script).
- **Segmented control (15):**
  - Track `colors.muted`, radius 14, padding 4, height 52.
  - Selected segment: white, 1 dp `colors.border`, radius 10 (`radius.sm`), label 15/700 `colors.textPrimary`.
  - Unselected label: 15/700 `colors.textSecondary`.
  - Segment height 44: raise to 48 for the touch target.
  - The shared `SegmentedControl` selected state uses a flameRedAccessible fill, which does not match.

### 0.13 Type scale used

| Size/weight | Use |
|---|---|
| 72/900 | Offer pay "₹67" (08). No tokens.ts entry: rider constant, `fontWeight` '900'. |
| 60/900 | Order code "CR-4107" (10), wide tracking (≈ +2). Rider constant. |
| 36/700 | OTP digits (12), estimated from cap height. Rider constant. |
| 30/700 (`typography.title`) | Money heroes ₹347 (05), ₹414 (15), ₹67 (14), ₹58 (16), ₹822 (17); shift timer 0:42:15 (07); "Emergency" (18, `colors.error`). |
| 24/700 (`typography.hero`) | Page H1s; kitchen and customer names (09, 11); km tiles (08); compact money (07, 14 Today); "2:18" (13); "Ravi Kumar" and "RK" (20); OTP input value (01, letterSpacing ≈ 6). |
| 19/700 (`typography.heading`) | Header titles, card titles, section headings, slot time, route, "New order", "28s left", timer title, fieldset legend, Accept and SOS-call labels, ₹3,240 / ₹2,915, vehicle, UPI, cover name. |
| 19/500 | "Stop somewhere safe first if you can." (18). |
| 16/700 (`typography.button`) | Button labels, red action links. |
| 15/700 and 15/400 (`typography.body`) | Values, list titles, in-card buttons; body copy and row labels. |
| 13/700 and 13/400 (`typography.small`) | Chips, badges, tabs, counters; meta, captions, footnotes, value labels ("Today", "Pick up from"). |
| 12/700 | Compact badges. |

- Multi-line body runs at about 1.45× line height. tokens.ts deliberately sets no fixed lineHeight, so if you add one, derive it from fontSize and test at font scale 1.3.
- Money and timers use tabular numerals (`fontVariant: ['tabular-nums']`).

### 0.14 Icons (outline style, one stroke weight, 24 unless noted)
- Glyphs used: moped/scooter (logo, ride-along), shield-alert-outline, shield-check-outline, weather-pouring, clock-outline, phone-outline, map-marker-outline, navigation-variant-outline, arrow-right (20), check, alert-circle-outline, camera-outline, lock-outline (20), calendar-blank-outline, chevron-left, chevron-right, close, menu-down and menu-right (FAQ carets), home-outline, wallet-outline, account-outline.
- `Icon.tsx` maps several names to filled MDI glyphs (`phone`, `clock`, `map-marker`, `home`, `account`). Add outline names rather than reusing the filled ones.
- Never use unicode triangles or emoji as icons.

---

## 1. Sign in — `01-SignIn.png` (390 × 844)

No header, no SOS, no tab bar. The design shows the **code step** only; the phone-number step is not designed.

1. **Brand row**, top 32:
   - Logo tile 40 × 40, `colors.flameRedAccessible`, radius ≈ 12, white moped glyph 24.
   - Gap 8, then "Craves Rider" 19/700 `colors.textPrimary`, vertically centred on the tile.
2. **H1** "Enter the code", 24/700 `colors.textPrimary`, top ≈ 96.
3. **Line, top ≈ 133:** "Sent by SMS to +91 98480 12345." 15/400 `colors.textSecondary`, followed inline by the link "Change number" 15/400 `colors.flameRedAccessible`, underlined.
4. **Field label** "6-digit code", 13/700 `colors.textSecondary`, top ≈ 175.
5. **Code input:**
   - y 198–254 (56 tall), full width, radius 14.
   - Border 1 dp `colors.textPrimary`. This is the focused state. The shared `InputField` focus is flameRed at 1.4 dp, which does not match.
   - Value "4 8 2 6 1 5", 24/700 `colors.textPrimary`, letterSpacing ≈ 6, padding-left 16.
   - Use `autoComplete="sms-otp"`, numeric keypad, maxLength 6.
6. **Flexible space.**
7. **Warning banner** (outer), y 609–683:
   - Icon shield-alert-outline.
   - Copy: "Craves never charges a fee, deposit or kit cost to join. Don't pay anyone who asks."
8. **Bottom action bar**, border at y 700:
   - **primary** "Verify" (y 717–773).
   - Under it, the neutral text button "Resend code in 24s", centred, top ≈ 797. It shows the countdown state; when the timer ends it becomes the tappable "Resend code" (not designed).

## 2. Account status — `02-AccountStatus.png` (390 × 1060, scrolls)

**Header:** variant A. Title "Your sign-up", chip neutral "Not active yet". No tab bar.

1. **H1** "Your sign-up is being checked", 24/700.
2. **Body** 15/400 `colors.textSecondary`: "Ops checks every document by hand. If we can't accept one, you'll see why here."
3. **Documents card** (y 182–580). Document rows, about 53 dp per single-line row, with inset dividers:
   - "Driving licence" — badge success "Accepted"
   - "Vehicle RC" — success "Accepted"
   - "Vehicle insurance" — success "Accepted"
   - "Pollution certificate (PUC)" — badge **error** "Not accepted". Under it:
     - Reason 15/400 `colors.textPrimary`: "The photo is blurry. Take a clear photo of the whole certificate in good light."
     - **outline-compact** button "Upload again", full card width.
   - "PAN card" — badge info "Checking"
   - "Bank account (UPI ••••@okhdfc)" — success "Name matches". The label wraps to 2 lines at 390.
4. **Card with icon** (y 597–688):
   - clock-outline 24 `colors.textSecondary`.
   - Title "Background check in progress" 15/700.
   - Body 15/400 `colors.textSecondary`: "This usually takes about a day. Your first slot opens once it clears."
5. **Card with icon** (y 705–800):
   - moped 24 `colors.textSecondary`.
   - Title "Then: training and a ride-along".
   - Body: "About an hour in person. Your free bag and T-shirt are handed over there."
6. **Bottom action bar:**
   - **primary** "Call support" with left phone icon.
   - Neutral text button "Sign out", centred.

## 3. Terms and rate card — `03-Terms.png` (390 × 1180)

**Header:** variant A. Title "Terms and rate card", chip neutral "Offline". No tab bar.

1. **Language chips**, y 85–125: "English" (selected), "తెలుగు", "हिन्दी".
2. **Meta line:** "Version 2026-10-v1, in force from 19 Oct", 13/400 `colors.textSecondary`, top ≈ 142.
3. **Standard badge, warning:** "Draft pricing, not final", top ≈ 164.
4. **Card "Rate card"** (y 202–621). Title 19/700, then rate rows with dividers:

   | Label | Value |
   |---|---|
   | "Base pay, first 2 km of the drop" | "₹40" |
   | "Each drop km after 2 km" | "₹9" |
   | "Ride to the kitchen, each km after the first 1 km" | "₹9" |
   | "Waiting at the kitchen, after 8 free minutes" | "₹1.50 a minute" |
   | "Guaranteed minimum in a booked slot" | "₹80 an hour" |
   | "Declining or missing an offer" | "Free" |

   Footnote 13/400 `colors.textSecondary`, no divider above it: "Any change to pay or rules appears here at least 14 days before it starts, with old and new example trips side by side."
5. **Card "How you're paid"** (y 639–801). Title 19/700, then two 15/400 `colors.textPrimary` paragraphs with an 8 gap:
   - "Your whole balance goes to your bank every Monday by 3 pm. You can also take out one free withdrawal a day."
   - "No fees, deposits, kit costs or penalties, ever."
6. **Card "Complaints and appeals"** (y 819–949). Title 19/700, then rate rows with no dividers:
   - "Craves rider support, every slot" — "[OPS PHONE]"
   - "Telangana Grievance Redressal Officer" — "Link added when the state portal opens" (value right aligned, wraps to 2 lines)
7. **Bottom action bar:**
   - **primary** "I accept these terms"
   - **outline** "Read the full terms"

## 4. Phone setup — `04-PhoneSetup.png` (390 × 1120)

**Header:** variant A. Title "Phone setup", chip neutral "Offline". No tab bar.

1. **Intro** 15/400 `colors.textPrimary`: "Do this once so offers reach you, even with the screen off. Xiaomi, Oppo, Vivo and Realme phones close apps to save battery unless you allow them."
2. **Progress row**, y 170–178:
   - Setup progress bar (flex) at 4/6.
   - Gap 12, then "4 of 6 done" 13/700 `colors.textPrimary`, right.
3. **Six step cards**, 12 gap. Each has a step circle, title 15/700 and sub 13/400 `colors.textSecondary`.
   - **Done cards** use the Card style. **Pending cards** use the Attention card style. Pending cards also hold:
     - an instruction 15/400 `colors.textPrimary`, full card width, under the title row;
     - an **outline-compact** button.

   | # | State | Title / sub | Instruction | Button |
   |---|---|---|---|---|
   | 1 | done | "Location while using the app" / "Needed to go online" | | |
   | 2 | done | "Notifications" / "Needed to go online" | | |
   | 3 | done | "Battery: no restrictions for Craves Rider" / "Recommended" | | |
   | 4 | pending | "Autostart on" / "Recommended" | "On your Xiaomi: open Security, then Permissions, then Autostart, and turn on Craves Rider." This text is per manufacturer. | "Open autostart settings" |
   | 5 | pending | "Lock Craves Rider in recent apps" / "Recommended" | "Open recent apps, press and hold the Craves Rider card, then tap the lock." | "I've locked it" |
   | 6 | done | "Test ring" / "Your phone rang and vibrated" | | Right-aligned red text link "Ring again" 15/700 |

4. **Bottom action bar:** **primary** "Back to Home".

## 5. Home, offline — `05-HomeOffline.png` (390 × 844)

**Header:** variant A. Title "Hi, Ravi" (first name), chip neutral "Offline". Tab bar, Home active.

1. **Warning banner** (y 86–173):
   - Icon weather-pouring.
   - Copy: "Heavy rain expected after 8 pm. Stop whenever you need to. It never affects your offers."
2. **Card** (y 190–298):
   - "Today" 13/400 `colors.textSecondary`
   - "₹347" 30/700
   - "5 trips, all from your lunch slot" 13/400 `colors.textSecondary`
3. **Card** (y 316–498):
   - "Your next slot" 13/400 `colors.textSecondary`
   - "7:00 pm to 10:00 pm" 19/700
   - "Madhapur and Kondapur" 15/400 `colors.textPrimary`
   - Inner success banner (shield-check-outline): "At least ₹80 an hour while you're online in this slot, even when orders are slow."
4. **Bottom action bar:** **primary** "Go online" (opens 06).
5. **Tab bar.**

## 6. Go online (selfie) — `06-GoOnline.png` (390 × 844)

This is the camera screen with the explainer copy on it. Full-bleed dark: background `colors.textPrimary` (#261A15, which is also `colors.espresso`). There is **no rider header, SOS, status chip or tab bar**; see differences.

1. **Top row**, y≈20–44:
   - `close` icon 24 `colors.white` at x 16, with a 48 hit area. Accessibility label: "Close".
   - Title "Quick selfie to go online", 19/700 white, x 60.
2. **Face guide oval:**
   - 246 × 311, centred, y 165–476.
   - Dashed white stroke about 3 dp (dash ≈ 8, gap ≈ 5).
   - Inside it, the live front-camera preview. The mock shows a placeholder silhouette in #3A2B24 and #5B4A42, which are not tokens and are not shipped.
3. **Heading** "Take off your helmet and look at the camera", 19/700 white, centred, 2 lines, top ≈ 502.
4. **Body** "Ops checks it's you. Customers never see this photo.", 15/400, centred, colour light warm grey. The nearest token is `colors.border` #E3DDD8; white at about 85% opacity also matches.
5. **Shutter**, centred, centre y ≈ 765:
   - Outer ring 80 dp (4 dp white stroke).
   - Inner disc 64 dp `colors.white`.
   - Accessibility label: "Take selfie".

## 7. Home, online — `07-HomeOnline.png` (390 × 844)

**Header:** variant A. Title "Hi, Ravi", chip live "Online · waiting for orders". Tab bar, Home active.

1. **Card** (y 85–278):
   - Row: "On shift" 13/400 `colors.textSecondary` on the left, "Slot ends 10:00 pm" 13/400 `colors.textSecondary` on the right.
   - "0:42:15" 30/700 tabular. It ticks every second in a leaf component.
   - "Madhapur and Kondapur" 15/400 `colors.textPrimary`.
   - Inner success banner: "Waiting is paid: at least ₹80 an hour in this slot."
2. **Card** (y 296–376):
   - Left: "Today" 13/400 `colors.textSecondary`, then "₹347" 24/700.
   - Right: "5 trips" 15/400 `colors.textSecondary`, vertically centred.
3. **Card with icon** (y 394–492):
   - map-marker-outline 24 `colors.textPrimary`.
   - Title "Rest point: Lakshmi's Kitchen, Madhapur" 15/700.
   - Body "Water, washroom, shade and phone charging while you wait." 15/400 `colors.textSecondary`.
4. **Footnote**, centred: "Offers ring even with the screen off." 13/400 `colors.textSecondary`.
5. **Bottom action bar:** **outline** "Go offline".
6. **Tab bar.**

## 8. Offer — `08-Offer.png` (390 × 844)

No header, no SOS, no tab bar. Full-screen card that rings; 40 s total, shown at 28 s.

1. **Offer countdown bar**, y 20–28, full width. Fill = remaining fraction (here 70%).
2. **Row**, y≈40–64:
   - "New order" 19/700 on the left.
   - "28s left" 19/700 tabular on the right. Announce to TalkBack at 30, 20, 10 and 5 s, not every second.
3. "You get at least" 15/400 `colors.textSecondary`.
4. **Pay hero** "₹67", 72/900 `colors.textPrimary`, y≈100–175.
5. **Breakdown** 13/400 `colors.textSecondary`: "₹40 base + ₹18 drop distance + ₹9 ride to the kitchen. Locked once you accept."
6. **Two tiles** (Card style), y 242–317, gap 12:
   - "To the kitchen" 13/400 `colors.textSecondary` / "2.0 km" 24/700
   - "Kitchen to customer" / "4.0 km"
7. **Card** (y 336–411):
   - "Madhapur" 19/700, arrow-right 20 `colors.textSecondary`, "Kondapur" 19/700.
   - Sub "About 28 min in total, 2 items" 15/400 `colors.textSecondary`.
8. **Note** above the bar, centred, 15/400 `colors.textPrimary`: "Declining is free and never affects your future offers."
9. **Bottom action bar** (border y 684):
   - **primary-offer** "Accept" (64 tall).
   - Gap 8, then **outline** "Decline".

## 9. To kitchen — `09-ToKitchen.png` (390 × 844)

**Header:** variant A. Title "Go to the kitchen", chip live "Trip · step 1 of 4". Step bar 1/4. No tab bar.

1. **Card** (y 101–237):
   - "Pick up from" 13/400 `colors.textSecondary`
   - "Lakshmi's Kitchen" 24/700
   - "Plot 41, Ayyappa Society, Madhapur" 15/400 `colors.textPrimary`
   - "Landmark: near Image Gardens" 15/400 `colors.textSecondary`
2. **Two-up outline buttons** (y 253–309):
   - "Call chef" (phone-outline)
   - "Navigate" (navigation-variant-outline)
3. **Helper**, 13/400 `colors.textSecondary`: "Navigate opens Google Maps in two-wheeler mode."
4. **Card** (y 348–456), key–value rows:
   - "Order code" — "CR-4107"
   - "Items" — "2, in a sealed bag"
   - "Your pay, locked" — "₹67"
5. **Bottom action bar:** **primary** "I've reached the kitchen".

## 10. At kitchen — `10-AtKitchen.png` (390 × 844)

**Header:** variant A. Title "At the kitchen", chip "Trip · step 2 of 4". Step bar 2/4.

1. **Hero card, order code** (y 101–253), content centred:
   - "Match this code with the chef's screen" 15/400 `colors.textSecondary`
   - "CR-4107" 60/900, tracking ≈ +2
   - "2 items from Lakshmi's Kitchen" 15/400 `colors.textPrimary`
2. **Row** (not a card, y 270–320, indented 4):
   - Check circle 24 `colors.success` with a white check.
   - Gap 12, then "Chef marked the bag sealed" 15/700.
   - Sub 13/400 `colors.textSecondary`: "Never open a sealed bag. If the seal is broken, tell the chef before you leave."
3. **Card, timer** (y 337–462):
   - clock-outline 24 `colors.textPrimary` + "Free waiting ends in 5:42" 19/700. The number ticks in a leaf component.
   - Free-wait bar (elapsed).
   - Body 15/400 `colors.textSecondary`: "Then you get ₹1.50 a minute until the chef hands over. The timer started when you arrived."
4. **Two-up outline buttons** (y 479–535):
   - "Call chef" (phone)
   - "Food not ready" (no icon)
5. **Bottom action bar:** **primary** "Picked up".

## 11. To customer — `11-ToCustomer.png` (390 × 844)

**Header:** variant A. Title "Go to the customer", chip "Trip · step 3 of 4". Step bar 3/4.

1. **Card** (y 101–237):
   - "Deliver to" 13/400 `colors.textSecondary`
   - "Anil" 24/700
   - "Flat 302, Sai Residency, Kothaguda, Kondapur" 15/400 `colors.textPrimary`
   - "Landmark: opposite Botanical Garden gate" 15/400 `colors.textSecondary`
2. **Two-up outline buttons:**
   - "Call Anil" (phone)
   - "Navigate" (navigation). No helper line on this screen.
3. **Card** (y 326–405):
   - "Order code" — "CR-4107"
   - "Items" — "2, in a sealed bag"
   - No pay row.
4. **Neutral banner** (y 422–508), icon alert-circle-outline: "Ride at your own pace. There's no delivery deadline on this screen, and lateness never changes your pay."
5. **Bottom action bar:** **primary** "I've reached the customer".

## 12. Deliver (OTP) — `12-Deliver.png` (390 × 844)

**Header:** variant A. Title "At the customer", chip "Trip · step 4 of 4". Step bar 4/4.

1. **Block** (no card, y 96–160):
   - Left: "Anil" 19/700, then "Flat 302, Sai Residency, Kondapur" 15/400 `colors.textSecondary`, wrapping to 2 lines.
   - Right: standard success badge with map-marker-outline 16 and "Near drop point".
2. **OTP fieldset card** (y 190–367):
   - Card style, with the legend "Ask Anil for the 4-digit OTP" 19/700 cut into the top border at x 33. The legend has a white background and 6 dp side padding.
   - **4 boxes**, each 72 × 72, gap 12, y 221–293:
     - 1 dp `colors.textPrimary` border, radius 14.
     - Digit 36/700 centred (shown: 4 7 1 9).
     - Build them as one hidden TextInput (numeric, maxLength 4) with 4 visual boxes.
   - **Helper** 13/400 `colors.textSecondary`: "Use only the OTP Anil reads to you at the door. Craves never asks for it on a call."
3. **outline** "Call Anil" (phone), full width.
4. **Red text link**, underlined, 16/700, centred: "Customer not answering?" (opens 13).
5. **Bottom action bar:** **primary** "Delivered". Disabled until 4 digits are entered. Wrong-OTP and lockout states are not designed.

## 13. Customer not answering — `13-CustomerNotAnswering.png` (390 × 1000)

**Header:** variant A. Title "Customer not answering", chip "Trip · step 4 of 4". **No step bar.**

1. **Success banner** (y 86–149), shield-check-outline: "Follow these steps and you're paid for this trip either way."
2. **Card of 4 step rows** (y 168–440), separated by full-card-width 1 dp `colors.border` dividers:
   1. Done circle — "Call Anil" 15/700 / "7:41 pm, no answer" 13/400 `colors.textSecondary`
   2. Done — "Call again" / "7:43 pm, no answer"
   3. Current circle "3":
      - "Wait at the door" / "Stay near the drop point".
      - Below the row: "You can leave at 7:53 pm" 15/700 (the second call plus the unreachable wait). Built as a time, not the designed "2:18" countdown and bar: no clock runs at the door (decision E5, P1-17).
   4. Locked circle "4" — "Leave the order with a photo" / "Unlocks when the timer ends"
3. **Neutral banner** (y 458–574), camera-outline: "The photo must show the food and the door or house number. Use the flash at night. Anil gets it straight away, with a button to say it didn't arrive."
4. **locked** button "Take a photo and leave the order" (y 592–646). The enabled state after the timer is not designed; it is presumably **primary**.
5. **outline** "Call Craves support" (phone).
6. **Note** 13/400 `colors.textSecondary`: "Not safe to leave it? After the timer you can mark the trip failed with a reason. Ops decides what happens to the food."
7. **Bottom action bar:** **outline** (not primary) "Anil came out: enter the OTP".

## 14. Trip complete — `14-TripComplete.png` (390 × 844)

**Header:** variant B. Chip live "Online · waiting for orders", SOS. No title.

1. **Success circle** 64 dp `colors.success` with a white check of about 32, centred, y 90–154.
2. "Trip complete" 24/700, centred.
3. "CR-4107 delivered to Anil at 7:52 pm" 15/400 `colors.textSecondary`, centred.
4. **Card** (y 234–442):
   - "You earned" 13/400 `colors.textSecondary`, then "₹67" 30/700.
   - 1 dp `colors.border` divider.
   - Pay rows:
     - "Base pay, first 2 km" — "₹40"
     - "Drop distance, 2.0 km more at ₹9" — "₹18"
     - "Ride to the kitchen, 1.0 km at ₹9" — "₹9"
   - Footnote 13/400 `colors.textSecondary`: "Credited now. You can withdraw it 24 hours from now."
5. **Card** (y 460–540):
   - Left: "Today" / "₹414" 24/700.
   - Right: "6 trips" 15/400 `colors.textSecondary`.
6. **Red text link**, not underlined, 16/700, centred: "Report a problem with this trip".
7. **Bottom action bar:** **primary** "Back to waiting".

## 15. Earnings — `15-Earnings.png` (390 × 844)

**Header:** variant A. Title "Earnings", chip neutral "Offline". Tab bar, Earnings active. No bottom action bar.

1. **Segmented control** "Today" (selected) / "This week", y 86–137.
2. "Today, Wed 21 Oct" 13/400 `colors.textSecondary`.
3. **Row:**
   - Left: "₹414" 30/700.
   - Right: "6 trips" 15/400 `colors.textSecondary`, baseline aligned.
4. **Nav row**, boxed (borderStrong): "Payouts and withdrawals" with a chevron (opens 17).
5. **Full-bleed list** from y≈272. Title / sub / amount / compact badge:

   | Title | Sub | Amount | Badge |
   |---|---|---|---|
   | "Madhapur to Kondapur" | "7:52 pm" | "₹67" | success "Credited" |
   | "Gachibowli to Kondapur" | "2:31 pm, includes waiting pay" | "₹79" | "Credited" |
   | "Madhapur to Kukatpally" | "1:58 pm" | "₹85" | "Credited" |
   | "Ameerpet to Kukatpally" | "1:24 pm, tap to see why" | "₹58" | warning "On hold" (row opens 16) |
   | "Madhapur to Madhapur" | "12:47 pm" | "₹49" | "Credited" |
   | "Gachibowli to Kondapur" | "12:10 pm" | "₹76" | "Credited" |

6. **Tab bar.** The "This week" tab content is not designed.

## 16. Trip pay (on hold) — `16-TripPay.png` (390 × 960)

**Header:** variant C, "Trip pay". No tab bar, no bottom action bar.

1. "Ameerpet to Kukatpally" 19/700.
2. "Completed Wed 21 Oct, 1:24 pm" 13/400 `colors.textSecondary`.
3. **Row:** "₹58" 30/700, gap 12, standard warning badge "On hold".
4. **Warning banner, no icon** (y 184–346), all text `colors.warningText`:
   - "Why it's on hold" 15/700
   - 15/400: "You left this order with a photo after the customer didn't answer. Ops checks the photo before releasing the pay. Only this trip is held."
   - 15/700: "Decision by Mon 26 Oct. A hold never lasts more than 7 days."
5. **Card** (y 364–500), pay rows:
   - "Base pay, first 2 km" — "₹40"
   - "Drop distance, 2.0 km more at ₹9" — "₹18"
   - "Ride to the kitchen, 0.8 km" — "First 1 km free"
   - Divider, then "Total" 15/700 `colors.textPrimary` — "₹58" 15/700.
6. **Card** (y 518–617):
   - "To the kitchen" — "0.8 km"
   - "Kitchen to customer" — "4.0 km by road"
   - Footnote 13/400 `colors.textSecondary`: "Rate card 2026-10-v1, locked when you accepted"
7. **outline** "Report a problem", full width.
8. **Note**, centred, 13/400 `colors.textSecondary`: "Support replies within 24 hours. Missing pay is fixed within 72 hours."

## 17. Payouts — `17-Payouts.png` (390 × 960)

**Header:** variant C, "Payouts". No tab bar, no bottom action bar.

1. **Hero card** (y 81–318):
   - "You can withdraw now" 13/400 `colors.textSecondary`
   - "₹822" 30/700
   - 15/400 `colors.textSecondary`: "Pay from Monday and Tuesday. Today's ₹414 can be withdrawn from tomorrow."
   - **primary** "Withdraw ₹822" (inside the card)
   - Caption, centred, 13/400 `colors.textSecondary`: "Free, once a day. Reaches you by 1 pm tomorrow."
2. **Card with icon** (y 335–433):
   - calendar-blank-outline.
   - Title "Next weekly payout: Mon 26 Oct, by 3 pm" 15/700.
   - Body 15/400 `colors.textSecondary`: "Your whole balance goes to UPI ••••@okhdfc. No minimum amount."
3. **Section heading** "Paid" 19/700.
4. **Card** (y 498–648):
   - "Week of 12 to 18 Oct" 15/700 on the left, "₹3,240" 19/700 on the right.
   - Row: compact success badge "Paid" + "Mon 19 Oct, 11:20 am" 13/400 `colors.textSecondary`.
   - "Bank ref (UTR) 629318472051" 13/400 `colors.textSecondary`.
   - Red text link "Report a problem" 15/700.
5. **Card** (y 666–816):
   - "Week of 5 to 11 Oct" — "₹2,915"
   - "Paid" + "Mon 12 Oct, 10:52 am"
   - "Bank ref (UTR) 628517390264"
   - "Report a problem"
6. **Footer**, centred, 13/400 `colors.textSecondary`: "Craves never takes fees, deposits or penalties from your pay."

## 18. SOS — `18-Sos.png` (390 × 844)

No header, no tab bar.

1. "Emergency" 30/700 `colors.error`, top ≈ 36.
2. "Stop somewhere safe first if you can." 19/500 `colors.textPrimary`.
3. **Success banner** (y 124–170):
   - Check circle 24 `colors.success` with a white check.
   - "Craves ops has your location" 15/700 `colors.successText`.
   - Show it only when the location was actually sent; the fallback is not designed.
4. **sos-call** "Call Craves ops" (phone, 72 tall, y 191–263).
5. **outline-strong** "Call 112" / "Police, fire, ambulance" (72 tall, y 283–355).
6. **Card** (y 376–520):
   - "If you've had an accident" 15/700.
   - Body 15/400 `colors.textPrimary`: "Ops calls you back within 15 minutes. Craves pays the first hospital bill and files the insurance claim for you. Your booked slots are paid while you recover."
7. **Bottom action bar:** **outline** "Close".

## 19. Notice — `19-Notice.png` (390 × 980)

**Header:** variant C, "Notice". No tab bar.

1. "Review of a delivery" 24/700.
2. "Sent Wed 21 Oct, 6:05 pm" 13/400 `colors.textSecondary`.
3. **Success banner** (y 148–232), shield-check-outline: "You can keep working. Your account is not paused. Only the pay for this one order is on hold."
4. **Card** (y 252–455):
   - "What happened" 15/700
   - 15/400 `colors.textPrimary`: "The customer for order CR-4093 (Ameerpet to Kukatpally, 21 Oct) says it didn't arrive. ₹58 is on hold while we check."
   - "What we're checking" 15/700
   - "Your photo at the door (1:24 pm), your two call attempts and your location on that trip."
5. **Card** (y 474–670):
   - "What happens next" 15/700.
   - Numbered list (circles 24), text 15/400 `colors.textPrimary`:
     1. "Tell us your side by **Wed 28 Oct**." (the date is 700)
     2. "A person at Craves looks at everything. The app never decides on its own."
     3. "You get the decision in writing, with the reasons."
6. **Note** 13/400 `colors.textSecondary`: "Disagree with the decision? Call rider support to appeal. You can also take it to the Telangana Grievance Redressal Officer."
7. **Bottom action bar:**
   - **primary** "Give your side"
   - **outline** "Call rider support" (phone)

## 20. Profile — `20-Profile.png` (390 × 1480)

**Header:** variant A. Title "Profile", chip neutral "Offline". Tab bar, Profile active. No bottom action bar.

1. **Identity row** (y 86–152):
   - Avatar 64 circle, fill `colors.cream`, 1 dp `colors.border`, initials "RK" 24/700.
   - Then "Ravi Kumar" 24/700 and "+91 ••••• •4321" 13/400 `colors.textSecondary`.
2. **Card:**
   - "Vehicle" 13/400 `colors.textSecondary`
   - "Honda Activa 6G" 19/700
   - "TS 09 •• ••12" 13/400 `colors.textPrimary`
3. **Card** "Documents" (label 13/400 `colors.textSecondary`), document rows with sub-lines:
   - "Driving licence" / "Expires 2 May 2031" — success "Verified"
   - "Vehicle RC" / "Expires 15 Jan 2034" — success "Verified"
   - "Vehicle insurance" / "Expires 8 Nov" — warning "Expires soon". Under it:
     - 15/400: "Renew it and upload the new policy before 8 Nov to keep going online."
     - **outline-compact** "Upload new policy"
   - "Pollution certificate (PUC)" / "Uploaded 20 Oct, ops checks it by hand" — info "Checking"
   - "PAN card" — success "Verified" (no sub)
4. **Card:**
   - "Payout account" 13/400 `colors.textSecondary`
   - "UPI ••••@okhdfc" 19/700
   - 13/400 `colors.textSecondary`: "To change it, visit the Craves office with your ID. This keeps your pay safe from anyone pretending to be you."
5. **Card:**
   - "Accident insurance" 13/400 `colors.textSecondary`
   - "Group accident cover, 24×7" 19/700 (× is the multiplication sign)
   - "[COVER AMOUNT]. No open claims." 15/400
   - **outline-compact** "Call for a claim"
6. "Language" 13/400 `colors.textSecondary`, then language chips (English selected).
7. **Card of nav rows:**
   - "Terms and rate card" ›
   - "Phone setup" ›
   - "Help" ›
8. Neutral text button "Sign out", centred.
9. **Tab bar.**

## 21. Help — `21-Help.png` (390 × 1000)

**Header:** variant C, "Help". No tab bar, no bottom action bar.

1. **Hero card** (y 81–316):
   - "Talk to a person" 19/700
   - 15/400 `colors.textSecondary`: "Rider support answers in every slot, in Telugu, Hindi or English."
   - **primary** "Call rider support" (phone)
   - **outline-compact** "Open the riders' WhatsApp group"
2. "Common questions" 19/700.
3. **Card, accordion.** Rows separated by full-card-width dividers, caret icon 12–16 `colors.textPrimary`, question 15/700:
   - Expanded (menu-down): "Do I lose anything if I decline an offer?". Answer 15/400 `colors.textSecondary`: "No. Declining, or letting an offer run out, is free and never changes your future offers."
   - Collapsed (menu-right), with answers not designed:
     - "When does waiting pay start?"
     - "What if the customer doesn't answer?"
     - "When am I paid?"
4. "Problem with a recent trip?" 19/700.
5. **Card of nav rows** (about 56 tall). Each row: 15/400 label, amount 15/700, then chevron-right:
   - "21 Oct, Madhapur to Kondapur" — "₹67"
   - "21 Oct, Gachibowli to Kondapur" — "₹79"
   - "21 Oct, Ameerpet to Kukatpally" — "₹58"

---

## Differences between the PNGs and the spec list

**PNG order matches the spec order; no page/name mismatches.**

### Screen names vs on-screen titles

| Spec name | On-screen copy |
|---|---|
| 1 Sign in | The code step "Enter the code" only. The phone-number step is not designed. |
| 2 Account status | Header "Your sign-up", H1 "Your sign-up is being checked", chip "Not active yet". |
| 5 Home offline / 7 Home online | Header "Hi, Ravi" with chips "Offline" and "Online · waiting for orders". |
| 6 Go online (selfie explainer) | The selfie camera screen "Quick selfie to go online". The explainer copy is on the camera screen; there is no separate explainer page. |
| 8 Offer | "New order". |
| 9 / 10 / 11 / 12 | "Go to the kitchen", "At the kitchen", "Go to the customer", "At the customer". The Deliver primary action reads "Delivered". |
| 18 SOS | "Emergency". |
| 19 Notice | H1 "Review of a delivery". |

### Header rule
The spec says there is a header on every screen except sign-in, offer and SOS. Differences:
- **06** has no header, SOS or status chip.
- **14** has a chip only, no title.
- **16, 17, 19, 21** have a back + title header with no status chip.

### Primary action rule
The spec says one 56 dp primary action at the bottom. Differences:
- **08** "Accept" is 64 tall with a 19 sp label.
- **18** calls are 72 tall and in the content area.
- **13**'s bottom action is an **outline** button; its primary action is locked in the content area.
- **15, 16, 17, 20, 21** have no bottom action bar (16 and 21 put buttons in content; 17's primary action sits inside the hero card).

### Other differences
- **Error colour.** The spec says error is SOS only, but **02**'s "Not accepted" badge uses `colors.error` on `colors.errorSoft`.
- **Deliver chip.** SCREENS-DESIGN.md calls the Deliver chip a "250 m chip"; the PNG reads "Near drop point" with no distance.
- **Order code.** "CR-4107" and "CR-4093" are placeholders. SCREENS-DESIGN.md says to show the real short order number: 8 characters from the order id, e.g. "#0BDE0101". At 60/900 that is wider than the hero card on 360 dp phones, so fit it with `adjustsFontSizeToFit` + `numberOfLines={1}` or a smaller size. Do not let it wrap mid-code.
- **Apostrophes.** The text layer has straight apostrophes ("Don't"). Use whatever the strings files use, consistently.

### Data and copy to confirm
- **Hold reason and dates.** 16 says the ₹58 Ameerpet→Kukatpally trip is held because a photo was left, with "Decision by Mon 26 Oct". 19 (same trip, CR-4093) says the customer reported non-arrival and gives "Tell us your side by Wed 28 Oct". The decision date comes before the reply deadline.
- **Placeholders** still in the copy: "[OPS PHONE]" (03), "[COVER AMOUNT]" (20), "Link added when the state portal opens" (03).
- **Offer duration.** "About 28 min in total" on 08 is the rider's effort estimate, not a customer promise. Keep it, and never show a customer ETA or lateness.

## States not designed (builders must still handle these, in the same visual language)

These come from SCREENS-DESIGN.md plus gaps visible in the PNGs:
- **Sign-in and joining:** phone-number entry; app update required; suspended account.
- **Selfie:** selfie rejected or retake; camera permission denied.
- **Going online:** location, notification or battery permission denied when going online.
- **Offer:** offer taken by another rider or expired; decline reasons.
- **Trip and OTP:**
  - wrong OTP, and the lockout after 5 attempts (switches to the photo fallback);
  - "Take a photo and leave the order" enabled, plus the photo-taken confirmation;
  - Mark-failed reason chips;
  - the SOS fallback when location could not be sent.
- **Content gaps:** "This week" earnings; empty earnings; the three collapsed FAQ answers.
- **Every screen:** loading (Skeleton), error with retry, and offline/queued actions.
- **Global:** Telugu and Hindi text; dark mode (none designed; ship light).
