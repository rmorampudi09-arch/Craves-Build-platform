---
version: alpha
name: Craves Rider
description: "The Craves delivery-partner app for Android riders in Hyderabad: flat white surfaces, 1 dp warm-grey borders, espresso text, one flame-red action per screen and a red SOS on every working screen. Built for a phone held one-handed on a scooter in sun or rain, where pay, codes and timers must read at a glance and nothing ever pressures the rider on time."

colors:
  flameRed: "#F62E18"
  flameRedAccessible: "#D92714"
  textPrimary: "#261A15"
  espresso: "#261A15"
  textSecondary: "#706864"
  placeholder: "#7D7570"
  border: "#E3DDD8"
  borderStrong: "#D5CEC8"
  white: "#FFFFFF"
  muted: "#F7F5F3"
  cream: "#FFF5E9"
  success: "#29B47B"
  successText: "#166B49"
  successSoft: "#E8F7F1"
  warning: "#D98C16"
  warningText: "#7A4A00"
  warningSoft: "#FFF4DF"
  error: "#C72C21"
  errorSoft: "#FDEAE8"
  info: "#2F6FED"
  infoText: "#1F4FAF"
  infoSoft: "#EAF0FF"

typography:
  offerPay:
    fontFamily: Roboto, system-ui, sans-serif
    fontSize: 72px
    fontWeight: 900
  orderCode:
    fontFamily: Roboto, system-ui, sans-serif
    fontSize: 60px
    fontWeight: 900
    letterSpacing: 2px
  otpDigit:
    fontFamily: Roboto, system-ui, sans-serif
    fontSize: 36px
    fontWeight: 700
  title:
    fontFamily: Roboto, system-ui, sans-serif
    fontSize: 30px
    fontWeight: 700
  hero:
    fontFamily: Roboto, system-ui, sans-serif
    fontSize: 24px
    fontWeight: 700
  heading:
    fontFamily: Roboto, system-ui, sans-serif
    fontSize: 19px
    fontWeight: 700
  headingMedium:
    fontFamily: Roboto, system-ui, sans-serif
    fontSize: 19px
    fontWeight: 500
  button:
    fontFamily: Roboto, system-ui, sans-serif
    fontSize: 16px
    fontWeight: 700
  sosLabel:
    fontFamily: Roboto, system-ui, sans-serif
    fontSize: 16px
    fontWeight: 800
  bodyStrong:
    fontFamily: Roboto, system-ui, sans-serif
    fontSize: 15px
    fontWeight: 700
  body:
    fontFamily: Roboto, system-ui, sans-serif
    fontSize: 15px
    fontWeight: 400
  smallStrong:
    fontFamily: Roboto, system-ui, sans-serif
    fontSize: 13px
    fontWeight: 700
  small:
    fontFamily: Roboto, system-ui, sans-serif
    fontSize: 13px
    fontWeight: 400
  badgeCompact:
    fontFamily: Roboto, system-ui, sans-serif
    fontSize: 12px
    fontWeight: 700

rounded:
  sm: 10px
  md: 14px
  lg: 20px
  xl: 26px
  pill: 9999px

spacing:
  none: 0px
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 20px
  xl: 24px
  xxl: 32px
  xxxl: 40px

components:
  rider-header:
    backgroundColor: "{colors.white}"
    textColor: "{colors.textPrimary}"
    typography: "{typography.heading}"
    padding: "{spacing.xs} {spacing.md}"
    height: 68px
  rider-header-back:
    backgroundColor: "{colors.white}"
    textColor: "{colors.textPrimary}"
    typography: "{typography.heading}"
    padding: "0px {spacing.md}"
    height: 64px
  status-chip-neutral:
    backgroundColor: "{colors.white}"
    textColor: "{colors.textPrimary}"
    typography: "{typography.smallStrong}"
    rounded: "{rounded.pill}"
    padding: "0px {spacing.sm}"
    height: 24px
  status-chip-live:
    backgroundColor: "{colors.successSoft}"
    textColor: "{colors.textPrimary}"
    typography: "{typography.smallStrong}"
    rounded: "{rounded.pill}"
    padding: "0px {spacing.sm}"
    height: 24px
  sos-button:
    backgroundColor: "{colors.error}"
    textColor: "{colors.white}"
    typography: "{typography.sosLabel}"
    rounded: "{rounded.md}"
    width: 56px
    height: 48px
  card:
    backgroundColor: "{colors.white}"
    textColor: "{colors.textPrimary}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  hero-card:
    backgroundColor: "{colors.white}"
    textColor: "{colors.textPrimary}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
  attention-card:
    backgroundColor: "{colors.white}"
    textColor: "{colors.textPrimary}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  banner-warning:
    backgroundColor: "{colors.warningSoft}"
    textColor: "{colors.warningText}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  banner-success:
    backgroundColor: "{colors.successSoft}"
    textColor: "{colors.successText}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  banner-neutral:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.textPrimary}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  banner-inner:
    backgroundColor: "{colors.successSoft}"
    textColor: "{colors.successText}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm}"
  badge-success:
    backgroundColor: "{colors.successSoft}"
    textColor: "{colors.successText}"
    typography: "{typography.smallStrong}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
    height: 24px
  badge-warning:
    backgroundColor: "{colors.warningSoft}"
    textColor: "{colors.warningText}"
    typography: "{typography.smallStrong}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
    height: 24px
  badge-info:
    backgroundColor: "{colors.infoSoft}"
    textColor: "{colors.infoText}"
    typography: "{typography.smallStrong}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
    height: 24px
  badge-error:
    backgroundColor: "{colors.errorSoft}"
    textColor: "{colors.error}"
    typography: "{typography.smallStrong}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
    height: 24px
  badge-compact:
    backgroundColor: "{colors.successSoft}"
    textColor: "{colors.successText}"
    typography: "{typography.badgeCompact}"
    rounded: "{rounded.pill}"
    padding: "2px {spacing.xs}"
    height: 20px
  button-primary:
    backgroundColor: "{colors.flameRedAccessible}"
    textColor: "{colors.white}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "0px {spacing.lg}"
    height: 56px
  button-primary-offer:
    backgroundColor: "{colors.flameRedAccessible}"
    textColor: "{colors.white}"
    typography: "{typography.heading}"
    rounded: "{rounded.md}"
    height: 64px
  button-sos-call:
    backgroundColor: "{colors.error}"
    textColor: "{colors.white}"
    typography: "{typography.heading}"
    rounded: "{rounded.md}"
    height: 72px
  button-outline:
    backgroundColor: "{colors.white}"
    textColor: "{colors.textPrimary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "0px {spacing.lg}"
    height: 56px
  button-outline-compact:
    backgroundColor: "{colors.white}"
    textColor: "{colors.textPrimary}"
    typography: "{typography.bodyStrong}"
    rounded: "{rounded.md}"
    height: 48px
  button-locked:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.textSecondary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    height: 56px
  button-ghost:
    textColor: "{colors.flameRedAccessible}"
    typography: "{typography.button}"
    height: 48px
  button-ghost-neutral:
    textColor: "{colors.textSecondary}"
    typography: "{typography.bodyStrong}"
    height: 48px
  bottom-action-bar:
    backgroundColor: "{colors.white}"
    padding: "{spacing.md}"
  tab-bar:
    backgroundColor: "{colors.white}"
    textColor: "{colors.textSecondary}"
    typography: "{typography.smallStrong}"
    height: 64px
  tab-item-active:
    textColor: "{colors.flameRedAccessible}"
    typography: "{typography.smallStrong}"
  trip-step-segment-done:
    backgroundColor: "{colors.textPrimary}"
    rounded: "{rounded.pill}"
    height: 4px
  trip-step-segment-todo:
    backgroundColor: "{colors.border}"
    rounded: "{rounded.pill}"
    height: 4px
  countdown-track:
    backgroundColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    height: 8px
  countdown-fill:
    backgroundColor: "{colors.flameRedAccessible}"
    rounded: "{rounded.pill}"
    height: 8px
  timer-bar-fill:
    backgroundColor: "{colors.textPrimary}"
    rounded: "{rounded.pill}"
    height: 6px
  pay-hero:
    textColor: "{colors.textPrimary}"
    typography: "{typography.offerPay}"
  order-code-card:
    backgroundColor: "{colors.white}"
    textColor: "{colors.textPrimary}"
    typography: "{typography.orderCode}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg} {spacing.md}"
  otp-box:
    backgroundColor: "{colors.white}"
    textColor: "{colors.textPrimary}"
    typography: "{typography.otpDigit}"
    rounded: "{rounded.md}"
    size: 72px
  rate-card-row:
    textColor: "{colors.textSecondary}"
    typography: "{typography.body}"
    padding: "10px 0px"
  document-row:
    textColor: "{colors.textPrimary}"
    typography: "{typography.body}"
    padding: "{spacing.sm} 0px"
  timer-card:
    backgroundColor: "{colors.white}"
    textColor: "{colors.textPrimary}"
    typography: "{typography.heading}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  language-chip-selected:
    backgroundColor: "{colors.textPrimary}"
    textColor: "{colors.white}"
    typography: "{typography.bodyStrong}"
    rounded: "{rounded.pill}"
    padding: "0px {spacing.md}"
    height: 40px
  language-chip:
    backgroundColor: "{colors.white}"
    textColor: "{colors.textPrimary}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "0px {spacing.md}"
    height: 40px
  segmented-track:
    backgroundColor: "{colors.muted}"
    rounded: "{rounded.md}"
    padding: "{spacing.xxs}"
  segmented-selected:
    backgroundColor: "{colors.white}"
    textColor: "{colors.textPrimary}"
    typography: "{typography.bodyStrong}"
    rounded: "{rounded.sm}"
    height: 48px
  avatar:
    backgroundColor: "{colors.cream}"
    textColor: "{colors.textPrimary}"
    typography: "{typography.hero}"
    rounded: "{rounded.pill}"
    size: 64px
  state-card:
    backgroundColor: "{colors.white}"
    textColor: "{colors.textPrimary}"
    typography: "{typography.bodyStrong}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  state-card-body:
    textColor: "{colors.textSecondary}"
    typography: "{typography.body}"
  skeleton-block:
    backgroundColor: "{colors.muted}"
    rounded: "{rounded.sm}"
  check-row:
    textColor: "{colors.textPrimary}"
    typography: "{typography.body}"
    height: 48px
---

## Overview

Craves Rider is the Android app delivery partners use to go online, take an offer, carry one order from a home kitchen to a customer, and see what they earned. The rider holds the phone one-handed, often on a moving scooter in Hyderabad sun or rain, wearing a helmet, on a mid-range Xiaomi, Oppo, Vivo, Realme or Samsung phone. The design answers that scene with a quiet, high-contrast working surface.

- **Surfaces.** White surfaces, 1 dp warm-grey borders and espresso text.
- **Colour.** Flame red marks exactly one action per screen. The SOS red sits in every working screen's header.
- **The few big numbers.** Offer pay at 72 sp black, the pickup code at 60 sp black, the OTP boxes, and the countdown and wait timers. Everything else is 13–19 sp.
- **The promise the design keeps.** Pay is shown first and locked. Declining is free. No deadline is shown and lateness never changes pay. A person decides every dispute. The copy says these things on the screens where a rider would doubt them, and the design never undercuts them with urgency colour, a customer ETA or a lateness warning.
- **Sources.** This is Craves's own system, taken from the mobile app's `apps/mobile/src/design/tokens.ts` and the 21 rider screens in `designs/`. It does not borrow the web design system (Manrope/Inter, red #E5342A) or any other brand's identity.

**Key characteristics**
- **Flat.** No shadow anywhere. Depth comes from a 1 dp `{colors.border}` line or, for the one thing that matters most on a screen, a 1 dp `{colors.textPrimary}` line.
- **One primary action** in a pinned bottom bar, 56 dp, `{colors.flameRedAccessible}`. Secondary actions are white outline buttons with a `{colors.borderStrong}` line.
- **A status chip and SOS in the header** of every working screen, so the rider always knows whether they are offline, waiting, or on which step of a trip.
- **Big numbers only where they carry the decision:** pay on the offer, the code at the kitchen, the OTP at the door.
- **Roboto, the system face,** in three weights: 400, 700 and 900.
- **Light theme only for now.** Dark mode is not designed.

## Colors

### Action and alarm
- **Flame red, accessible** (`{colors.flameRedAccessible}` — `#D92714`): primary buttons, red text links ("Change number", "Customer not answering?", "Report a problem"), the active tab, and the offer countdown fill. It passes 4.5:1 on white for text.
- **Flame red** (`{colors.flameRed}` — `#F62E18`): the brand red. It is not used on rider screens, because white text on it fails contrast. Keep it out of text-bearing surfaces.
- **Error** (`{colors.error}` — `#C72C21`): alarm red, used for the SOS header button, the SOS screen ("Emergency" title and the "Call Craves ops" button), and the "Not accepted" document badge. Nothing else.

### Text and lines
- **Text primary / espresso** (`{colors.textPrimary}` — `#261A15`): all primary text. Also the strong 1 dp line on hero and attention cards and OTP boxes, the done segments of the trip step bar, the timer bars, the selected language chip, and the selfie screen's background.
- **Text secondary** (`{colors.textSecondary}` — `#706864`): labels above values, row labels, meta lines, captions, the offline status dot, and inactive tabs.
- **Placeholder** (`{colors.placeholder}` — `#7D7570`): input placeholders only.
- **Border** (`{colors.border}` — `#E3DDD8`): every card edge, divider, header and bar line, the neutral chip outline, and upcoming step-bar segments.
- **Border strong** (`{colors.borderStrong}` — `#D5CEC8`): outline buttons, unselected language chips, the Earnings nav row, and empty step circles.

### Surfaces
- **White** (`{colors.white}`): every screen and card.
- **Muted** (`{colors.muted}` — `#F7F5F3`): progress tracks, the neutral banner, the segmented-control track, and the locked button fill.
- **Cream** (`{colors.cream}` — `#FFF5E9`): the avatar disc only.

### State
| Tone | Soft fill | Text | Solid | Used for |
|---|---|---|---|---|
| Success | `{colors.successSoft}` #E8F7F1 | `{colors.successText}` #166B49 | `{colors.success}` #29B47B | Online and trip status chip; "paid either way" reassurance banners; Accepted, Verified, Credited and Paid badges; done step circles; setup progress |
| Warning | `{colors.warningSoft}` #FFF4DF | `{colors.warningText}` #7A4A00 | `{colors.warning}` (not used as a fill) | Rain and fraud warnings, "On hold", "Expires soon", "Draft pricing, not final" |
| Info | `{colors.infoSoft}` #EAF0FF | `{colors.infoText}` #1F4FAF | — | "Checking" badges only |
| Error | `{colors.errorSoft}` #FDEAE8 | `{colors.error}` #C72C21 | `{colors.error}` | "Not accepted" badge, SOS |

The success tone does reassurance work, not celebration: "You can keep working", "you're paid for this trip either way", "Waiting is paid".

## Typography

### Font family
Roboto, the Android system face, loaded by the platform with no custom font files. All sizes are sp, with `allowFontScaling` on (`textDefaults`). Money and timers use `fontVariant: ['tabular-nums']` so digits don't jump while counting.

### Hierarchy
| Token | Size | Weight | Use |
|---|---|---|---|
| `{typography.offerPay}` | 72 | 900 | The pay figure on the offer ("₹67"). One per app. |
| `{typography.orderCode}` | 60 | 900, +2 tracking | The pickup code on the order-code card. |
| `{typography.otpDigit}` | 36 | 700 | One digit per OTP box. |
| `{typography.title}` | 30 | 700 | Money heroes (today's total, you earned, withdrawable), the shift timer, "Emergency". |
| `{typography.hero}` | 24 | 700 | Page H1, kitchen and customer names, km tiles, secondary money, the door-wait countdown, the profile name. |
| `{typography.heading}` | 19 | 700 | Header titles, card titles, section headings, slot time, route, the countdown label, Accept and SOS-call labels. |
| `{typography.headingMedium}` | 19 | 500 | The SOS subtitle only. |
| `{typography.button}` | 16 | 700 | Button labels and red action links. |
| `{typography.sosLabel}` | 16 | 800 | "SOS" in the header button. |
| `{typography.bodyStrong}` | 15 | 700 | Row values, list titles, step titles, in-card button labels. |
| `{typography.body}` | 15 | 400 | Body copy, banner text, row labels. |
| `{typography.smallStrong}` | 13 | 700 | Status chip, badges, tab labels, counters ("4 of 6 done"). |
| `{typography.small}` | 13 | 400 | Labels above values ("Today", "Pick up from"), meta, captions, footnotes. |
| `{typography.badgeCompact}` | 12 | 700 | Compact badges in list rows. |

### Principles
- **Three steps of weight:** 400 for reading, 700 for anything to act on or compare, and 900 only for the two numbers the rider must read from arm's length (offer pay, order code).
- **Map to tokens.ts.** `title` 30, `hero` 24, `heading` 19, `button` 16, `body` 15 and `small` 13 already exist in tokens.ts. 72, 60, 36 and 12 are rider-only constants; keep them in one rider type file, not inline per screen. tokens.ts has no weight '900': add `black: '900'` beside `fontWeight`, or define it in the rider file.
- **Line height.** Multi-line body reads at about 1.45× in the designs. tokens.ts deliberately sets no fixed line heights so scaled text is not clipped. If a component sets one, derive it from fontSize and check at font scale 1.3.
- **Scripts.** Telugu, Hindi and Kannada use the same sizes as English. Their glyphs are taller and their words longer, so nothing that holds text has a fixed height (minHeight only), and every label may wrap: buttons centre their lines with 8 dp above and below, chips and segments wrap inside the pill, the status chip wraps inside the header. Never truncate or shrink a label to fit.

## Layout

### Spacing system
- **Base unit:** 4 dp, from tokens.ts `spacing`: `{spacing.xxs}` 4, `{spacing.xs}` 8, `{spacing.sm}` 12, `{spacing.md}` 16, `{spacing.lg}` 20, `{spacing.xl}` 24, `{spacing.xxl}` 32, `{spacing.xxxl}` 40.
- **Screen padding:** 16 left and right. 16 below the header line; 12 when the trip step bar follows.
- **Between cards and blocks:** 16. Phone-setup step cards use 12.
- **Inside cards:** 16 padding. 4–8 between a small label and its value; 8 between paragraphs.
- **Rows:** rate-card rows 10 above and below with a divider; breakdown rows on a 26 dp pitch with no dividers; key–value rows on a 28 dp pitch.
- **Leading icons:** 24 dp, text starting 10 dp after the icon. Step circles 28 dp, text starting 12 after.

### Screen frame
From top to bottom:
1. **Rider header** (68 dp, or 64 for back and chip-only headers), with a 1 dp bottom line.
2. **Optional trip step bar.**
3. **Scrolling content.**
4. **Pinned bottom action bar:** a 1 dp top line, 16 padding, buttons stacked 8 apart.
5. **Pinned tab bar** (64 dp) on the three home tabs only: Home, Earnings, Profile.

Trip screens hide the tab bar, because the trip is the only job.

### Whitespace
Generous separation between blocks, tight grouping inside them. Content is left-aligned. The only centred compositions are the success moment (Trip complete), the order-code card, the selfie screen and footnotes.

## Elevation & Depth

None. Every surface is flat.

| Level | Treatment | Use |
|---|---|---|
| 0 | No line | Screen, banners (soft fill only), text blocks |
| 1 | 1 dp `{colors.border}` | Cards, dividers, header and bar lines |
| 1-strong | 1 dp `{colors.textPrimary}` | Hero cards, attention cards, the focused code input, OTP boxes, "Call 112" |

tokens.ts `elevation.card` and `elevation.primaryAction` exist for other app surfaces. Rider screens use `elevation.none` only. The shared `Button` (primary) and `PressableCard` apply shadows by default, so override them.

## Shapes

### Border radius scale
| Token | Value | Use |
|---|---|---|
| `{rounded.sm}` | 10 | Selected segment inside the segmented control |
| `{rounded.md}` | 14 | Cards, banners, every button, the SOS button, OTP boxes, the code input, the Earnings nav row, the segmented track |
| `{rounded.lg}` | 20 | Hero cards only (order code, withdraw, talk to a person) |
| `{rounded.pill}` | 9999 | Status chip, badges, language chips, all bars, circles, the avatar |

`{rounded.xl}` 26 is in tokens.ts but unused on rider screens.

## Components

### Navigation and chrome

**`rider-header`.** Shown on every working screen except sign-in, offer, selfie and SOS.
- **Left column:**
  - Title in `{typography.heading}`. Allow 2 lines at large font scales; never truncate an instruction.
  - Under it, the status chip.
- **Right:** the `sos-button`.
- **Variants:**
  - `rider-header-back`: a chevron-left with a 48 dp hit area, the title starting at x 56, and no chip. Used on Trip pay, Payouts, Notice, Help, Phone setup, and Terms read from Profile. A screen the app opens by itself (Terms to accept, the application, Your account) is the only screen there is and has no back.
  - Chip-only: no title. Used on Trip complete.
- White, with a 1 dp `{colors.border}` bottom line.

**`status-chip-neutral` / `status-chip-live`.** A 24 dp pill.
- **Layout:** 12 dp inset, an 8 dp dot, 6 dp gap, then the label in `{typography.smallStrong}` `{colors.textPrimary}`.
- **Neutral:** white fill, 1 dp `{colors.border}` line, `{colors.textSecondary}` dot. Labels: "Offline", "Not active yet".
- **Live:** `{colors.successSoft}` fill, 1 dp `{colors.success}` line, `{colors.success}` dot. Labels: "Online · waiting for orders", "Trip · step N of 4".
- It is text, not a button.

**`sos-button`.** 56 × 48 dp, `{colors.error}`, `{rounded.md}`, "SOS" in `{typography.sosLabel}` white.
- Same place on every header.
- Opens the SOS screen in one tap with no confirmation.
- Accessibility label: "SOS, emergency help".

**`bottom-action-bar`.** Pinned, white, a 1 dp `{colors.border}` top line, 16 padding. Holds one primary button, optionally with one outline button or a neutral text button 8 below it.

**`tab-bar`.** 64 dp, a 1 dp top line, three equal items: an outline icon 24 over a label in `{typography.smallStrong}`. Active `{colors.flameRedAccessible}`, inactive `{colors.textSecondary}`. Only on Home, Earnings and Profile.

**`trip-step-segment-done` / `-todo`.** Four 4 dp pills across the content width with 4 dp gaps. Done and current segments are `{colors.textPrimary}`; upcoming segments are `{colors.border}`. Announced as one element, "Trip step N of 4".

### Containers

**`card`.** White, 1 dp `{colors.border}`, `{rounded.md}`, 16 padding, no shadow. Never nested.

**`hero-card`.** White, 1 dp `{colors.textPrimary}`, `{rounded.lg}`. At most one per screen, for the single thing the rider came for (the code, the withdrawable money, a person to talk to).

**`attention-card`.** A card with a 1 dp `{colors.textPrimary}` line at `{rounded.md}`. Marks a step still waiting on the rider in a checklist (phone setup).

**`timer-card`.** A card with a clock icon 24 and a live title in `{typography.heading}` ("Free waiting ends in 5:42"), then a 6 dp `timer-bar-fill` on a `{colors.muted}` track showing elapsed time, then one line of `{typography.body}` `{colors.textSecondary}` saying what happens when it ends. The ticking text and bar live in a leaf component.

**Banners.** All banners have a soft fill, no line, and `{rounded.md}`.

| Banner | Padding | Leading icon | Text starts |
|---|---|---|---|
| `banner-warning`, `banner-success`, `banner-neutral` (full width) | 16 | 24, tone text colour | 50 dp from the banner's edge |
| `banner-inner` (success, inside a card) | 12 | 24 | 42 dp from the banner's edge |

A banner may carry a bold first line ("Why it's on hold") and a bold closing line (the decision date).

### Status

**Badges.** `badge-success`, `badge-warning`, `badge-info` and `badge-error` are 24 dp pills, 10 dp side padding, `{typography.smallStrong}`. `badge-compact` (20 dp, `{typography.badgeCompact}`) sits under amounts in list rows.

| Tone | Labels |
|---|---|
| success | "Accepted", "Name matches", "Verified", "Credited", "Paid", "Near drop point" (with a pin icon) |
| warning | "On hold", "Expires soon", "Draft pricing, not final" |
| info | "Checking" |
| error | "Not accepted" |

The shared `Badge` uses these tones. Its 28 dp minHeight is acceptable; 24 dp matches the design.

**Step circles.** 28 dp.
- Done: `{colors.success}` fill, white check.
- Current: 2 dp `{colors.textPrimary}` ring with a 13/700 numeral.
- Locked: 2 dp `{colors.borderStrong}` ring with a `{colors.textSecondary}` numeral.
- Not started: an empty `{colors.borderStrong}` ring.

**Numbered list circles** are 24 dp, solid `{colors.textPrimary}`, white numeral.

### Buttons

All buttons use `{rounded.md}` and have no shadow.

| Component | Height | Fill / line | Label | Notes |
|---|---|---|---|---|
| `button-primary` | 56 | `{colors.flameRedAccessible}` | white `{typography.button}` | Optional white 20 dp left icon (phone). |
| `button-primary-offer` | 64 | as primary | `{typography.heading}` | "Accept" on the offer, the one moment where speed and certainty matter most. |
| `button-sos-call` | 72 | `{colors.error}` | white `{typography.heading}` | Phone icon 24. SOS screen only. |
| `button-outline` | 56 | white, 1 dp `{colors.borderStrong}` | `{colors.textPrimary}` `{typography.button}` | Optional 24 dp icon. Two outline buttons may sit side by side with a 12 dp gap ("Call chef" / "Navigate"). |
| `button-outline-compact` | 48 | as outline | `{typography.bodyStrong}` | In-card secondary actions: "Upload again", "Open autostart settings", "Call for a claim". |
| outline-strong | 72 | 1 dp `{colors.textPrimary}` | two lines | "Call 112" / "Police, fire, ambulance". |
| `button-locked` | 56 | `{colors.muted}`, no line | `{colors.textSecondary}`, lock icon 20 | Marks an action that unlocks later. Hint: "Unlocks when the timer ends". |
| `button-ghost` | 48 hit area | none | `{colors.flameRedAccessible}` `{typography.button}` | Text-only action. Underlined when it is an escape route ("Customer not answering?", "Change number"). |
| `button-ghost-neutral` | 48 hit area | none | `{colors.textSecondary}` `{typography.bodyStrong}` | "Sign out", "Resend code in 24s". |

The shared `Button` differs from this design:
- the outline variant draws a flameRed line with a red label;
- disabled is 48% opacity;
- primary carries `elevation.primaryAction`.

Pass styles, or add rider variants, rather than shipping those looks.

### Trip-critical components

**Pay hero (`pay-hero`).** Layout on the offer, top to bottom:
1. "You get at least" in `{typography.body}` `{colors.textSecondary}`.
2. The amount in `{typography.offerPay}` `{colors.textPrimary}`.
3. One line of `{typography.small}` breaking the amount into rate-card parts, ending "Locked once you accept."

The amount is the server's locked figure in paise, formatted with `formatRupees`. The client never adds anything up.

**Countdown bar (`countdown-track` + `countdown-fill`).** An 8 dp pill bar at the top of the offer.
- The fill is the remaining fraction and shrinks to zero at expiry.
- "28s left" in `{typography.heading}` sits right-aligned under it.
- Drive the bar with `transform: scaleX` from the server's expiry time, not from a local 40 s guess.
- TalkBack announces at 30, 20, 10 and 5 s, not every second.

**Order-code card (`order-code-card`).** A hero card, centred, with 20 padding top and bottom:
1. "Match this code with the chef's screen" in `{typography.body}` `{colors.textSecondary}`.
2. The code in `{typography.orderCode}`.
3. "2 items from Lakshmi's Kitchen" in `{typography.body}`.

The real code is the 8-character short order number (e.g. "#0BDE0101"). Keep it on one line with `adjustsFontSizeToFit` (minimum scale 0.6), and never wrap it mid-code.

**OTP input (`otp-box` × 4).** Four 72 × 72 boxes with a 12 dp gap, each 1 dp `{colors.textPrimary}` at `{rounded.md}` with one digit in `{typography.otpDigit}`.
- Built as one hidden numeric TextInput (maxLength 4) behind four visual boxes, so paste, autofill and TalkBack read it as one field.
- Sits in a card whose legend ("Ask Anil for the 4-digit OTP") is cut into the top line.
- At widths under 390 the boxes flex equally (`flex: 1`, `aspectRatio: 1`, minimum 56).

**Sign-in fields.** One `InputField` each, no `maxLength` (Android cuts a paste to it before the app sees it):
- The mobile number keeps its 10 digits from whatever arrives: typed, pasted or autofilled with +91, a 0 or spaces.
- The code takes typed digits, a pasted "482 615" or a whole SMS, and the sixth digit checks it: no Verify tap (Verify stays, for a retry).
- With Google Play services, Android asks once per SMS, in its own sheet, whether Craves Rider may read that message; Allow fills the code in. One `{typography.small}` line under the field says so ("When the SMS comes, tap Allow and the code fills in by itself.") only where the phone can do it.

**Rate-card row (`rate-card-row`).** Label in `{typography.body}` `{colors.textSecondary}` filling the row; value in `{typography.bodyStrong}` `{colors.textPrimary}` right-aligned. The value may wrap ("Link added when the state portal opens"). 1 dp `{colors.border}` dividers sit between rows inside the card padding. The same row without dividers is the trip-pay breakdown, closed by a divider and a bold "Total" row.

**Document row (`document-row`).** Document name in `{typography.body}`, optional sub-line in `{typography.small}` `{colors.textSecondary}` ("Expires 8 Nov"), and a status badge right-aligned to the name.
- When a document needs action, the row grows: the reason or instruction in `{typography.body}`, then a full-width `button-outline-compact`.
- Rows are divided by inset 1 dp `{colors.border}` lines.

**Language chips.** `language-chip-selected` is espresso-filled; `language-chip` is white with a 1 dp `{colors.borderStrong}` line. Each label is in its own script: "English", "తెలుగు", "हिन्दी", "ಕನ್ನಡ". The visual chip is 40 dp minimum; extend the hit area to 48. The same chip (`ChoiceChip` in `components/Choices.tsx`) picks the vehicle, the distance limits and a report category; TalkBack reads it as a radio button, checked or not.

**Segmented control.** `segmented-track` is muted, `{rounded.md}`, with 4 dp padding. `segmented-selected` is a white segment with a 1 dp `{colors.border}` line at `{rounded.sm}`. The unselected label is `{colors.textSecondary}`. Labels wrap inside their segment. Built as `Segmented` in `components/Choices.tsx` (Today / This week, UPI / Bank); the shared `SegmentedControl` fills the selected segment red, so it is not used.

**Check row (`check-row`).** A 24 dp outline box (ticked: espresso) with its sentence 10 dp after it; the whole row is one 48 dp target and the sentence wraps. Used for "I am 18 or older".

### States

Every screen that loads something shows one of these, never a blank screen, a spinner in the middle of nothing, or a raw error. They live in `components/StateCard.tsx`; `domain/problem.ts` decides which problem a failure is.

**`state-card`.** A card: a 24 dp outline glyph in `{colors.textSecondary}`, then 10 dp later a bold title and one or two lines of `{colors.textSecondary}` body; at most one `button-outline-compact` across the card. Left-aligned like every card. It never uses red, never pulses and never shows an illustration.

| State | Glyph | Title, then body | Action |
|---|---|---|---|
| Loading | none | Skeleton cards shaped like what will arrive (a label, a big figure, a line); TalkBack hears "Loading" once | none |
| Empty | the subject's own glyph (moped for trips, wallet for payouts, inbox for recent trips, shield for notices) | what is missing, then what makes it appear ("Each trip shows here with its pay as soon as you deliver it.") | none, or the one thing that fills it |
| Offline (no answer from Craves) | wifi-off | "No internet", then "This loads when you're back online." | Try again |
| Not available (5xx, 429, storage not ready) | cloud-off | "Craves isn't answering", then "The problem is on our side." | Try again |
| Not yet (switched off, no rate card, route not deployed: TERMS_UNAVAILABLE, RIDER_CHOICES_OFF, a 404 with no code) | progress-clock | "Not switched on yet", then "Check again later." | Try again |
| Not allowed (403 for the rider role) | lock-outline | "Not open to your account", then "Call rider support if that seems wrong." | Check again: a fresh sign-in token, then the account read again (a token from before activation lacks the role). Showing it asks for the account once by itself; Home stops polling meanwhile |
| Refused (the server said no, with a code) | alert | "This didn't load", then the server's own words in English, the app's words for the code in Telugu, Hindi and Kannada | Try again |

- **Failed actions** (accept, withdraw, report, send your side) say the same thing in one line, in a warning banner by the button or an alert, from `riderMessage`. The rider's words stay in the field.
- **The start of the app** shows the name "Craves Rider" and an espresso spinner while it checks the sign-in; when that fails, the offline state with "You stay signed in" and Sign out as a `button-ghost-neutral` below, never a forced sign-out (unsynced trip steps stay on the phone).
- **SOS without the rider role** (signing up, closed) shows "Calls work any time…" instead of a failure: both calls always work, and the location goes to ops only for a rider the server knows.
- **Waiting for the rate card** (`RATES_PENDING`): an approved rider whose city has no published rate card yet sees why they can't accept terms, with "Check again", instead of an error.

## Do's and Don'ts

### Do
- **Keep every surface flat:** white cards with a 1 dp line, `elevation.none` everywhere. No shadows, not even on the primary button.
- **Give each screen exactly one primary (flame red) action**, pinned in the bottom bar where the thumb rests. Everything else is outline, compact outline or a text link.
- **Put the status chip and the SOS button in the header** of every working screen, in the same place, every time.
- **Show pay first and locked.** Every amount comes from the server in paise and is formatted with `formatRupees`. The app never computes, rounds or estimates pay.
- **Keep ticking things in leaf components.** Each countdown, shift timer and wait timer lives in a small component that owns its interval, so the screen above it does not re-render every second. Derive time from server timestamps.
- **Animate only `opacity` and `transform`, at 200 ms or less,** using `design/motion.ts`. Respect `reducedMotion.ts`: cut or crossfade when reduce-motion is on. Progress bars use `scaleX`.
- **Handle every state on every screen:** loading (Skeleton or ContentLifecycle), error with a retry, empty, offline (queued actions say they are saved and will send), permission denied, and a lost race ("taken by another rider").
- **Navigate with Google Maps in two-wheeler mode.** "Navigate" opens the Google Maps app with two-wheeler travel mode, and the screen says so.
- **Write in the rider's terms:** short sentences, controls named by their action ("I've reached the kitchen", "Picked up", "Delivered"), and reassurance where doubt arises ("Declining is free…", "You can keep working…").
- **Use `{colors.error}` only for SOS** (and the single "Not accepted" badge).

### Don't
- **Don't add a shadow, gradient, blur or glow.**
- **Don't put two red buttons on one screen**, and don't make a secondary action red-filled.
- **Don't show a customer promised time**, a delivery deadline, a lateness warning, a "hurry" colour or a speed score. The to-customer screen says the opposite on purpose.
- **Don't build an in-app map**, map tiles or a route preview. Text addresses with a landmark, plus Navigate.
- **Don't do money maths on the client**, or show an amount the server has not locked.
- **Don't put a timer's `setInterval` in a screen component.**
- **Don't animate layout properties** (width, height, margin) or run motion longer than 200 ms.
- **Don't ship a screen with only its happy path.**
- **Don't use icon tiles** (the shared `Icon` surface) or filled icons. Icons are bare outline glyphs.
- **Don't use unicode triangles or emoji as icons.**
- **Don't use eyebrow labels as decoration.** Small `{typography.small}` labels exist only to name the value under them ("Today", "Pick up from").

## Responsive Behavior

### Widths

| Width (dp) | Key changes |
|---|---|
| 360 (small Android) | Content width 328. OTP boxes flex to about 64 dp. Two-up buttons are 158 dp each; let labels wrap to 2 lines rather than truncate. The order code shrinks to fit. Rate-card values wrap under long labels. |
| 390 (design frame) | As designed. |
| 412 (large Android) | Content width 380. Cards and buttons stretch. The pay hero, order code and OTP boxes keep their size (OTP boxes cap at 72). |

There is no tablet layout; the rider app is phone-only.

### Font scale 1.3
- **Header:**
  - The title wraps to 2 lines (`numberOfLines={2}`).
  - The chip grows with its text (minHeight, not height).
  - SOS stays 56 × 48 and keeps its label on one line.
- **Offer pay** grows to about 94 sp, which still fits. The **order code** scales down to fit its card on one line (`adjustsFontSizeToFit`).
- **Two-up buttons** stack vertically when their labels no longer fit side by side. In Telugu, Hindi and Kannada they always stack, each full width, so the pair never sits side by side at two different heights.
- **Badges and chips** use minHeight so Telugu, Hindi and Kannada glyphs are not clipped.
- **The bottom bar grows.** The scroll content gets enough bottom padding that the last block clears it.
- **Verify** on a device with `adb shell settings put system font_scale 1.3`, then reset to 1.0.

### Touch targets
- 48 × 48 dp minimum with 8 dp between targets: language chips, text links, the back chevron, accordion rows and the close button all extend their hit areas to 48.
- Primary actions are 56 dp. Accept is 64 and SOS calls are 72.

### TalkBack
- Headers and section titles get `accessibilityRole="header"`.
- The status chip, step bar and countdowns are single readable elements. Countdowns use `accessibilityLiveRegion="polite"` and announce at intervals, not every tick.
- Amounts read as rupees, e.g. "67 rupees", using `formatRupees` output with an accessibility label.
- Decorative icons are hidden (`accessibilityElementsHidden`). Icon-only controls (back, close, shutter) have labels.
- The locked button reports `disabled` with a hint saying why.
- The OTP field is one input labelled "4-digit OTP from the customer".
- Focus order runs top to bottom, then the bottom bar, then the tab bar.

### Insets and system
- Edge-to-edge with safe-area insets: no fixed top or bottom constants.
- System Back always works. It never cancels a trip silently: it leaves the trip screen, and the trip stays active.
- One exception: on a live offer Back does nothing, like an incoming call. The offer can't be opened again, so only Accept or Decline decide; once it has ended, Back closes it.
- Going offline asks first ("Go offline?", Stay online / Go offline), and on a trip says the trip stays yours. Break and Head home are hidden during a trip.
- While ops checks an application, a card asks for notifications if they are off ("we'll tell you the moment ops decides"), so the decision can arrive as a notice; refused for good, its button opens the app's settings. Accepting the first pay terms opens Phone setup by itself.
- A check the rider asks for (Check now, Check again) that finds nothing new still answers, in `{typography.small}` under the button: "Checked at 4:09 pm. …"; one that couldn't check says why instead (`riderMessage`), never that nothing changed.

## Iteration Guide

1. **Build one component at a time** and reference its YAML key (`{components.order-code-card}`, `{components.button-outline}`). Put it in `features/rider/components`, and reuse it across all screens that need it.
2. **Use token names everywhere** (`colors.X`, `spacing.X`, `radius.X`, `typography.X`). The only new constants are the four rider type sizes (72, 60, 36, 12) and weight 900, kept in one file.
3. **Variants are separate entries** (`-selected`, `-locked`, `-live`). Document default, pressed, disabled, loading and error states; there is no hover.
4. **Check every screen against its PNG** in `designs/` at 390 dp, then at 360 and 412, then at font scale 1.3, then with TalkBack.
5. **Keep the action hierarchy fixed:** one primary per screen, flame red; secondary actions outline. A third level of emphasis is a text link.
6. **Keep the rider's promises intact.** When adding copy or a state, keep pay locked and visible, declines free, no deadlines, and a person deciding disputes.
7. **Prefer an existing shared component over a new one.** Check `Badge`, `Button`, `Chip`, `InputField`, `SegmentedControl` and `Skeleton` first, then pass rider styles. Fork only when the shared default would leak a shadow, a red outline or opacity-based disabled styling.

## Known Gaps

- **Dark mode** is not designed. Ship light only and hold the theme fixed.
- **States now built from "States" above,** not from a PNG: app update required, suspended account, selfie refused or too large, permission denied on going online, offer taken or expired, wrong OTP and lockout, the "This week" earnings tab, empty earnings and payouts, offline and server-down on every screen. Still without a design: decline reasons, the photo-taken confirmation and mark-failed reasons (built from SCREENS.md prose).
- **Telugu, Hindi and Kannada** are translated but hidden from riders until a native speaker signs each off (`REVIEWED_LANGUAGES` in `strings/StringsProvider.tsx`); demo builds show all four. The server stores only en, te or hi, so a Kannada reader is English there (`serverLanguage`): its own messages (terms summary, refusals the app has no words for) arrive in English.
- **Some values are estimates.** The OTP digit size (36) and the SOS label weight (800) were read from pixels, not from a source file.
- **Not in Stitch's 8-prop component schema.** Borders and the selfie screen's dashed oval guide and shutter are described in prose only, because the schema has no line or stroke property.
