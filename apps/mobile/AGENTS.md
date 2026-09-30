# Craves Mobile Working Baseline

## Source Of Truth

- Work only in `C:\mscratch\apps\mobile`, repository `C:\mscratch`.
- Use `KUSHIRAVI-app-build` or a branch created from it. Do not modify the original
  `mobile-ui-rebuild-from-scratch` branch and do not push to GitHub.
- User-approved application baseline is `KUSHIRAVI-app-v1.15.1`, source
  `5dece0e8cae9208aeccdcf12f231e336ad830bec`.
- The phone-safe restoration is `KUSHIRAVI-app-v1.15.1-restored`, versionName
  `1.15.1`, versionCode `22`. Resolve its exact source with `git rev-parse
  KUSHIRAVI-app-v1.15.1-restored^{}`. See `KUSHIRAVI_VERSION.md` for verified
  installation evidence, not historical chat assumptions.

## Withdrawn Changes

The user explicitly withdrew changes starting with v1.15.2. Do not use those
changes, design decisions, performance claims or implementation approaches as
the active baseline, and do not reintroduce them unless explicitly requested.
Future work starts from the restored v1.15.1 code plus subsequent explicitly
requested changes recorded in `KUSHIRAVI_VERSION.md`, and the user's latest request.
Historical tags are rollback records, not approval to reuse withdrawn changes.

## Change Discipline

- Confirm Git branch/status before changing anything; preserve unrelated changes.
- Make only the precise requested update. Preserve the existing UI/UX and flows.
- Do not change backend, APIs, auth, payments, cart/order rules or Chef business
  logic without a new explicit request. Payments use Razorpay, not Cashfree.
- Every meaningful app update gets version notes and a local commit. Installable
  APKs get a higher versionCode, appropriate versionName and a distinct immutable
  tag. Never overwrite existing APK checkpoints or version tags, especially v1.
- Use `scripts\build-kushiravi-release-apk.ps1`. Keep source rebuildable and report
  exact source SHA, tag, APK path and phone version. Build/install when requested
  or required for verification. Replace-install without clearing user data.
- This instruction file preserves project decisions for future work. It is not
  evidence that past chat messages or platform memory have been erased.
