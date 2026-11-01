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

## Auth: live overlays restored to `main` (13 Oct 2026)

Live image: `cravesrm09prodlow6bf632.azurecr.io/craves/auth-service@sha256:258e4126151be06968742caf03d14bb443f8df4c08486b7d0fbd3ca7a94a2b0c`, tag `email-test-pairs-87eddd1c4563`.

Production was built as a chain of JAR overlays that never went through `main`. Their source is now on `main`:

| ACR tag | Date (IST) | Adds | Source restored from |
|---|---|---|---|
| `msg91-c83c3d5b42f51e983afc79bd13ae2c0b27c2cd9f` | 29 Sep | `in.craves.auth.msg91.*`, `/api/v1/auth/msg91/verify`, migration V18, security filter changes | Azure Repos `rmorampudi09/Craves` commit `c83c3d5b` |
| `member-read-335024f2-20261001` | 1 Oct | `ReferralAccessController` also enabled by `CRAVES_REFERRAL_MEMBER_READ_ENABLED` | local commit `335024f2` (branch `codex/referral-mobile-backend-20261001`) |
| `central-otp-1002-ed955bdc`, `central-otp-realtime-1002` | 2 Oct | `in.craves.auth.centralotp.*`, `/api/v1/auth/otp/send` + `/verify`, migration V19 | `KUSHIRAVI-app-build` commit `8f956490f`, `apps/mobile/backend-patches/msg91-centralized-v1/auth` |
| `otp-test-whitelist-20261006-185231` | 7 Oct | phone OTP test numbers (`CRAVES_OTP_TEST_*`, `CentralOtpTestBypass`) | laptop package `craves-otp-test-bypass` |
| `email-test-pairs-ec1c060c625e`, `email-test-pairs-87eddd1c4563` | 7 Oct | `EmailVerificationTestBypass` | branch `fix/email-test-bypass-20261007` commit `87eddd1c4` |

How it was checked: the restored source, compiled against the libraries in the `otp-test-whitelist` JAR (sha256 `a5003312…`), gives bytecode identical to that JAR for 164 of its 166 classes, and every resource (all migrations, including V18 and V19) is byte-identical. The two differences are intended: `AuthServiceApplication` now calls the lock, and `EmailVerificationService` carries the later email layer, which is taken from its tagged commit.

`CentralOtpTest` needs a disposable PostgreSQL server. It runs when `CENTRAL_OTP_TEST_DB` is set, as launch regression CI does.

New Auth changes go through `main` like every other service.

## Integration: Pidge coordinate fix (lost 10 Oct 2026, restored to `main` 14 Oct)

On 2 Oct an overlay (`pidge-coordinates-20261002-v1`, image `sha256:9c0919f6…`, source `KUSHIRAVI-app-build` `bfc870c2a`) stopped `PidgeApiClient` from rejecting quotes whose pickup and drop city labels differ (for example `HYD` and `Hyderabad`). It never reached `main`, so the backend releases of 8–10 Oct, which rebuild Integration from `main`, silently removed it. The lock could not catch this: the classes still existed, only their behaviour changed. The fix is now on `main`; its classes compile to bytecode identical to the 2 Oct image.

## Limits

- The lock protects builds that include it, which means every build from `main` from now on. It cannot stop someone from redeploying an old image or a branch that predates it. Rule 1 covers that case.
- It checks classes, not behaviour. Code changed inside a kept class is covered only by review and tests.
- If an app's `CRAVES_ENVIRONMENT` were removed, the lock would not run there. Infra sets it on every app (`infra/prodlow-rebuild/main.bicep`).
