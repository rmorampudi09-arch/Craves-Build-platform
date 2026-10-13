# Chef journey E2E (Playwright)

Regression suite for: new number → OTP → chef application (Basic details, Your kitchen, FSSAI, Identity, Review) → submit → pending → admin approval → chef app (Home, Orders, Menu, Earnings, More, money pages).

- `tests/` runs against a **production build** with every `/api` call served by `support/backend.ts` (a stateful fake built from craves.in responses). No backend, no OTP SMS, no flakiness from shared data. Unmocked calls fail the test.
- `live/` is a **read-only** smoke test for craves.in after a release.
- Known bugs are `test.fail()` with a P-level note. They pass while the bug exists and go red when it is fixed: delete the `test.fail` line in the fix PR.

## Run the mocked suite

```bash
cd apps/customer-web-next
npm ci && npm run build            # CI already has the NEXT_PUBLIC_FIREBASE_* values
cd e2e && npm ci
npx playwright test                # starts the built server on :3100 with the flags below
npx playwright show-report         # screenshots of every screen at 320/375/768/1440
```

Server flags the suite needs (set by `webServer` in `playwright.config.ts`):
`CRAVES_CHEF_ONBOARDING_V2_ENABLED=true`, `CRAVES_CENTRAL_OTP_ENABLED=true`, `CRAVES_API_BASE_URL=https://api.invalid`.
To use a server you started yourself: `CRAVES_E2E_BASE_URL=http://127.0.0.1:3100 npx playwright test`.

Projects: `phone-375` and `desktop-1440` run the journey, step, resilience and chef-app specs; `small-320`, `layout-375`, `tablet-768`, `layout-1440` run `responsive.spec.ts`.

## Run the live smoke

```bash
npx playwright open https://craves.in/chef/sign-in --save-storage=chef-state.json   # sign in as the approved test chef
CRAVES_LIVE=1 CRAVES_LIVE_STORAGE=./chef-state.json npx playwright test --project=live
```

Keep `chef-state.json` out of git; it holds a session.

## Why it stays flake-free

- Role, label and text locators only; no CSS classes, no `waitForTimeout`.
- Clock pinned to 12 Oct 2026 09:00 IST (`page.clock.install`), so the 18+ rule and greetings never drift.
- `reducedMotion: "reduce"`, service workers blocked, map tiles stubbed.
- Each test gets its own fake backend; tests run fully parallel.
- Faults are injected deterministically (`backend.fail(method, path, "abort" | "commit-then-abort" | status)`), e.g. the save the server committed while the browser timed out.

Verified 12 Oct 2026 on build a655950 (the live build): 142/142 passing across all six projects, and 222/222 on a 3× repeat of the functional projects (no flaky results).
