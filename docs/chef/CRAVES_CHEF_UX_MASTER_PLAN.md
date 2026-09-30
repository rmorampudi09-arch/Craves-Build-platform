# Craves Chef Side — UX Master Plan & Engineering Handoff

This document is the source-of-truth plan for the Chef side of Craves. It consolidates the supplied Chef UX/design specifications, component library, accessibility audit, design critique/research plan, screen prompts, and the current repository contracts.

## 1. Product principles

- WhatsApp simplicity: one obvious action per screen.
- Show, don't tell: use examples, sample images and plain language.
- Never lose progress: preserve draft state and resume the exact step.
- One-finger navigation: five bottom tabs on mobile.
- Primary CTA is thumb-reachable and normally full width on mobile.
- Avoid dense dashboards, technical labels, unnecessary dropdowns and hidden state machines.
- Use color as reinforcement, never as the only status signal.
- Every motion has a reduced-motion fallback.

## 2. Chef journey

Entry -> Phone OTP -> Existing customer / new account resolution -> Email OTP -> 8-step chef onboarding -> Review & submit -> Under review / rejected / approved -> Chef Home.

Eight onboarding steps:
1. Personal details
2. Phone & email verification
3. Kitchen details
4. Kitchen location
5. Kitchen photos
6. FSSAI / food safety
7. Identity & address proof
8. Bank details

The final review screen shows completion percentage and a checklist. Tapping a missing section opens that exact step.

## 3. Module map

### Module A — Entry & Authentication
Screens: Chef Entry, Phone Login, OTP, Email Verification, session recovery.
UX: familiar OTP behavior, clear resend timer, lockout copy, accessible OTP labels, no keyboard traps.
Current integration: existing Craves Auth/session and email verification contracts.

### Module B — Chef Onboarding
Screens: progress overview, personal details, contact verification, kitchen details, map-first location, kitchen photos, FSSAI, KYC/address proof, bank, review/submit.
UX: persistent Step N of 8 shell, autosave indicator, back/continue, validation on blur, exact missing-section recovery.
Current backend: chef application + document upload + email verification + bank onboarding exist. FSSAI and kitchen-photo onboarding persistence are not currently represented by a dedicated web API contract.

### Module C — Verification & Application Status
States: Not submitted, In progress, Under review, Rejected, Approved.
Rejected state must expose the reason and the exact repair path. Approved state transitions to Chef Mode.

### Module D — Chef Home / Dashboard
Hero: chef identity, verification, rating.
Primary control: large Accepting orders switch.
Stats: today's orders, revenue/earnings, rating, active menu items.
Secondary quick actions: orders, menu, earnings, kitchen/profile.
No internal workflow jargon.

### Module E — Kitchen Management
Screens: kitchen overview, edit kitchen, location update, operating status.
Current integration: GET/PUT /api/chef/kitchen backed by Catalog kitchen ownership rules.

### Module F — Orders
Screens: New, Preparing, Ready, Completed, order detail, confirmation sheets.
Order card shows customer, items, quantity, amount, prep time and exactly one next legal action.
Current integration: list/detail plus accept/reject/ready-for-pickup APIs.

### Module G — Menu
Screens: menu list, add/edit dish, image, availability.
Two controls must remain distinct:
- Available today / sold out today
- On my menu / listed
Use different visual treatments and explicit aria labels.
Current integration: menu CRUD, availability and image APIs.

### Module H — Earnings & Finance
Screens: earnings overview, settlement history, finance balance, statement, bank details, tax profile, withdrawal where supported.
Chef-facing labels:
- netPayable -> You get
- commissionAmount -> Craves fee
- orderAmount -> Order total
- settlement states -> Paid / On the way / Processing
Never expose raw enum names.
Current integration: earnings, finance/statement, bank onboarding and finance panels exist.

### Module I — Meal Subscriptions
Screens: plans list, create/edit plan, schedule, capacity, subscriber/plan actions.
Important confirmation before pause. Current integration includes subscription plans, schedules and capacity APIs.

### Module J — Reviews & Ratings
Screens: rating summary, rating distribution, published review list.
Read-only for chef. Screen readers must hear a sentence such as “4.8 out of 5 stars from 120 reviews.”
Current backend: /api/v1/chef/reviews and kitchen summary exist; a Chef web BFF route is required for the new Chef UI screen.

### Module K — Notifications
Screens: grouped notification inbox, unread state, action-required state, empty/error/loading.
Order, payment, document and delivery icons. Red is reserved for action-required issues.
Current backend: generic in-app notification BFF exists and can be reused for Chef identity.

### Module L — Profile & Settings
Single scrollable page with editable cards:
- Personal information
- Kitchen information
- Location
- Kitchen photos
- Documents
- Bank details
- Notifications
- Help/support
- Logout
Avoid nested settings navigation.

### Module M — Reusable UX Components
PrimaryButton, TextInput, OTPInput, Toggle/Switch, StatusBadge, Card, StatCard, OrderCard, MenuCard, DocumentCard, ProgressWizard, ProgressRing, CountdownChip, BottomSheet, OnboardingTooltip, SkeletonLoader, EmptyState, ErrorState, MapLocationPicker, PhotoUploadGrid.

## 4. Navigation model

Mobile: five fixed glass tabs — Home, Orders, Menu, Earnings, Profile.
Desktop: fixed left sidebar containing Craves Chef identity and the same five primary destinations. Secondary destinations are reached from Profile or contextual actions, not a crowded primary nav.

## 5. Visual system

Page background #F7F8F7
Card background #FFFFFF
Action green #1FA463
Text #1A1A1A
Secondary text #6B6B6B
Placeholder #9CA3AF — placeholder only
Border #E5E7EB
Input #F1F3F5
Success #16A34A
Warning #F59E0B
Error #DC2626
Info #2563EB
Food accent #FF8A3D

Glassmorphism is reserved for floating elements such as the mobile bottom navigation and transient sheets/overlays. It must not become a page-wide background treatment.

## 6. Accessibility requirements

- WCAG 2.1 AA target.
- Primary CTA contrast must be fixed: current #1FA463 with white text is below AA for normal text. Use a darker action green or enforce a large-text-only rule; the implementation should prefer the darker safe action token for normal buttons.
- Placeholder gray never replaces a real label.
- Warning orange never appears as ordinary text on white.
- Status badges include labels and icons, not color alone.
- Minimum 44x44px interactive target; primary buttons should be at least 48px high.
- Reduced motion for shake, pulse, bounce, slide and count-up effects.
- Progress uses accessible progress semantics.
- Form errors are field-specific and announced.
- Maps always have a fully equivalent manual address path.

## 7. Current backend capability matrix

Supported today in the web branch:
- Auth/session and email verification
- Chef application read/write
- Secure chef application document uploads and individual document review states
- Approved-chef kitchen profile
- Menu CRUD, availability and image management
- Chef orders, order detail and legal workflow actions
- Earnings and finance/statement surfaces
- Automatic bank onboarding
- Chef-owned subscription plans and capacity
- Chef reviews backend
- In-app notifications

Explicit integration gaps to keep visible rather than fake:
- FSSAI number/certificate/three-branch workflow has no dedicated current API in the web branch.
- Kitchen-photo onboarding persistence is not represented by a dedicated current application API.
- The current application backend evidence contract is centered on applicant photo, government ID front/back and tax ID; voter-ID/address-proof-specific storage is not currently represented.
- Chef Profile is currently composed from existing application, kitchen, bank and notification APIs rather than one dedicated profile endpoint.

These gaps are product/engineering work items, not reasons to hide the intended UX. The UI plan should preserve the intended flow and clearly separate wired functionality from future compliance integrations.

## 8. Implementation sequence

1. Chef visual system and responsive shell
2. Mobile bottom navigation + desktop sidebar
3. Dashboard availability-first UX
4. Onboarding wizard shell and progress/resume model
5. Kitchen, menu and order visual refresh
6. Earnings/finance language and hierarchy
7. Profile, reviews and notifications surfaces
8. Subscription/capacity contextual navigation
9. Accessibility regression tests
10. Exact-head CI validation

## 9. QA acceptance checklist

- No primary CTA below the contrast requirement.
- No color-only status.
- No tappable target below 44x44px.
- Every field has a visible label.
- Every loading state has a skeleton or explicit status.
- Every mutation has loading, success and failure states.
- Order cards expose one next action only.
- Menu controls clearly distinguish listed vs available today.
- Chef can always return to the exact onboarding step.
- Reduced-motion mode removes movement-heavy effects.
- Mobile has no horizontal scroll and bottom nav respects safe area.
- Desktop uses sidebar navigation without duplicating five primary destinations in multiple places.
