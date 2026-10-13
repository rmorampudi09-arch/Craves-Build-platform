# Live runtime safety: nothing may break what production runs

Owner rule (Raviteja, Oct 2026): no change, rebuild from `main`, pipeline or manual command may break or remove anything production is running.

## Rules

1. **Production runs only code that is on GitHub `main`.** Branch, Azure Repos and laptop builds are allowed only if their source is merged to `main` the same day, and the image tag names the commit.
2. **A deploy may add code. It may only remove code on purpose.** Each backend service lists the code it must keep in `services/<service>/src/main/resources/live-runtime-lock.txt`.
3. **Never edit a lock file to get a deploy through.** If the lock blocks a build, the build is missing live code. Restore that code instead.
4. **Restore before rebuilding.** Before rebuilding a service from `main`, compare the live image with `main`, as #489 did for Order image 186.

## How the lock works

- Every Java service calls `LiveRuntimeLock.verify()` first in `main()`, before Spring and Flyway start.
- When `CRAVES_ENVIRONMENT` starts with `prod`, the service checks that every class in its lock file is in the build. If one is missing, it stops with `LIVE_RUNTIME_LOCK: refusing to start … lacks code production already runs: […]`.
- It stops before Flyway, so the database is not touched. A revision that never starts never becomes ready, and in single-revision mode Azure Container Apps keeps traffic on the running revision. Production keeps working, and the failed deploy shows the error in its logs.
- The check does nothing outside production (tests, CI, local runs).
- `scripts/release/tests/test_launch_live_runtime_lock.py` runs in launch regression CI. It fails when:
  - a service skips the check;
  - a new controller is not listed;
  - a listed class disappears from `main`;
  - a `live-only` entry is now on `main` (drop its marker).

To retire code on purpose, delete its line from the lock file in the same PR, with the reason in the PR description.

## Auth (12 Oct 2026): production is ahead of `main`

Live image: `cravesrm09prodlow6bf632.azurecr.io/craves/auth-service@sha256:258e4126151be06968742caf03d14bb443f8df4c08486b7d0fbd3ca7a94a2b0c`, tag `email-test-pairs-87eddd1c4563`.

It was built as a chain of JAR overlays. Each one patched the previous live JAR without going through `main`:

| ACR tag | Date (IST) | Adds | Source |
|---|---|---|---|
| `msg91-c83c3d5b42f51e983afc79bd13ae2c0b27c2cd9f` | 29 Sep | `in.craves.auth.msg91.*` (MSG91 settings, `/auth/msg91/verify`) | not on GitHub (probably Azure Repos `rmorampudi09/Craves`) |
| `member-read-335024f2-20261001` | 1 Oct | unknown | not on GitHub |
| `central-otp-1002-ed955bdc`, `central-otp-realtime-1002` | 2 Oct | `in.craves.auth.centralotp.*`, `/api/v1/auth/otp/send` + `/verify`, migration V19 (`auth_phone_otp`) | branch `KUSHIRAVI-app-build`, `apps/mobile/backend-patches/msg91-centralized-v1/auth` |
| `otp-test-whitelist-20261006-185231` | 7 Oct | phone OTP test numbers (`CRAVES_OTP_TEST_*`) | not on GitHub |
| `email-test-pairs-ec1c060c625e`, `email-test-pairs-87eddd1c4563` | 7 Oct | `EmailVerificationTestBypass` | branch `fix/email-test-bypass-20261007` |

The Auth lock lists these classes as `live-only`. Until they are restored to `main`, an Auth build from `main` refuses to start in production. Without the lock, it would start and silently remove phone sign-in on craves.in.

Until the source is restored, ship Auth changes only as another overlay on the live JAR, using the method in `README-EMAIL-TEST-BYPASS.md` on `fix/email-test-bypass-20261007`. Record each new overlay here.

## Limits

- The lock protects builds that include it, which means every build from `main` from now on. It cannot stop someone from redeploying an old image or a branch that predates it. Rule 1 covers that case.
- It checks classes, not behaviour. Code changed inside a kept class is covered only by review and tests.
- If an app's `CRAVES_ENVIRONMENT` were removed, the lock would not run there. Infra sets it on every app (`infra/prodlow-rebuild/main.bicep`).
