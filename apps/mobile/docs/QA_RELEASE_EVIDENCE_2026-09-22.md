# Craves Mobile QA Release Evidence - 2026-09-22

Working directory: `/workspace/scratch/4bd5168d545c/craves-platform/apps/mobile`

## Latest QA/Contracts Agent Update

Scope for this pass was restricted to tests, QA/check scripts, QA evidence, and mobile APIM contract manifests.

Files changed:

- `apps/mobile/scripts/p119-apim-contract-coverage-check.mjs`
- `apps/mobile/__tests__/APIMContractManifestGuards.test.ts`
- `apps/mobile/docs/agents/apim-contracts-ios.md`
- `apps/mobile/docs/QA_RELEASE_EVIDENCE_2026-09-22.md`
- `api/apim-api/contracts/mobile-production.v1.json`
- `api/apim-api/contracts/mobile-subscriptions.v1.json`
- `api/apim-api/contracts/mobile-catalog-presentation.v1.json`

What changed:

- Hardened P119 so weak manifests fail for synthetic `/mobile-contract/` routes, unresolved template fragments, adjacent placeholders, invalid route characters, and model/validator naming drift.
- Normalized the mobile APIM manifests so the 91 detected mobile HTTP actions use concrete APIM-style route patterns instead of generated placeholder paths.
- Added Jest coverage for mobile APIM contract manifests.
- Updated APIM contract evidence to reflect the current passing state.

Latest commands:

| Command | Result | Evidence |
| --- | --- | --- |
| `npm run check:p119` | PASS | 91 production mobile HTTP actions across 3 manifests; 29 call-bearing source files audited. |
| `npm test -- --runInBand --runTestsByPath __tests__/APIMContractManifestGuards.test.ts __tests__/IOSReadinessGuards.test.ts` | PASS | 2 suites passed, 7 tests passed. |
| `npm run check:p120` | PASS | P120 observability audit check passed. |
| `npm run check:ios-release` | PASS | iOS release readiness check passed. |
| `npx tsc --noEmit` | PASS | TypeScript completed with exit code 0. |
| `npm run lint` | PASS | `eslint .` completed with exit code 0. |
| `npm run test:integration -- --silent` | PASS | 11 suites passed, 54 tests passed. |
| `npm run test:e2e -- --silent` | PASS | 1 suite passed, 6 tests passed. |
| `npm test -- --runInBand --silent` | PASS | 157 suites passed, 722 tests passed. |

Current residual risk:

- Native iOS build, simulator launch, CocoaPods resolution, Firebase runtime verification, Apple signing, archive/export, and TestFlight upload still require macOS/Xcode and real release credentials.
- The Firebase plist in this sandbox remains a non-secret placeholder and must be replaced through secure release preparation before real Firebase runtime validation.
- The APIM manifests are source-surface-aligned sandbox manifests and must be reconciled with APIM-published source-of-truth manifests before final release approval.

## Scope

- Edited only `__tests__/**`, `scripts/**` QA/check scripts, `docs/**` QA evidence, and `api/apim-api/contracts/mobile-*.json`.
- Added focused Linux-runnable iOS readiness guard coverage in `__tests__/IOSReadinessGuards.test.ts` and APIM manifest guard coverage in `__tests__/APIMContractManifestGuards.test.ts`.
- Did not touch production app code, native project files, or `main`.

## Environment

- Host: Linux `6.18.44` x86_64 GNU/Linux
- Node: `v24.19.0`
- npm: `11.9.0`
- Java: OpenJDK `17.0.20`
- Ruby: missing (`ruby: command not found`)
- Bundler: missing (`bundle: command not found`)
- CocoaPods: missing (`pod: command not found`)
- Xcode CLI: missing (`xcodebuild: command not found`)
- iOS simulator tooling: missing (`xcrun: command not found`)
- macOS tooling: missing (`sw_vers: command not found`)
- Android SDK: `ANDROID_HOME` and `ANDROID_SDK_ROOT` unset

## Commands Run

| Command | Result | Evidence |
| --- | --- | --- |
| `node -v` | PASS | `v24.19.0` |
| `npm -v` | PASS | `11.9.0`; npm also prints `Unknown env config "http-proxy"`. |
| `uname -srmo` | PASS | `Linux 6.18.44 x86_64 GNU/Linux` |
| `java -version` | PASS | OpenJDK `17.0.20`. |
| `ruby -v` | FAIL / ENV | `/bin/bash: line 1: ruby: command not found` |
| `bundle --version` | FAIL / ENV | `/bin/bash: line 1: bundle: command not found` |
| `pod --version` | FAIL / ENV | `/bin/bash: line 1: pod: command not found` |
| `xcodebuild -version` | FAIL / ENV | `/bin/bash: line 1: xcodebuild: command not found` |
| `xcrun simctl list devices` | FAIL / ENV | `/bin/bash: line 1: xcrun: command not found` |
| `sw_vers` | FAIL / ENV | `/bin/bash: line 1: sw_vers: command not found` |
| `npm ci` | PASS | Installed 1175 packages in 33s; deprecation warnings only. |
| `npm test -- --runInBand --runTestsByPath __tests__/IOSReadinessGuards.test.ts` | PASS | 1 suite passed, 4 tests passed. |
| `npm test -- --runInBand --runTestsByPath __tests__/APIMContractManifestGuards.test.ts __tests__/IOSReadinessGuards.test.ts` | PASS | 2 suites passed, 7 tests passed. |
| `npx tsc --noEmit` | PASS | TypeScript completed with exit code 0 after the scoped guard test was made TS-safe. |
| `npm run lint` | PASS | `eslint .` completed with exit code 0. |
| `npm run check:p119` | PASS | 91 production mobile HTTP actions across 3 published manifests are mapped; 29 call-bearing source files audited. |
| `npm run check:p120` | PASS | `P120 observability audit check passed.` |
| `npm run check:ios-release` | PASS | `iOS release readiness check passed.` |
| `npm run test:integration -- --silent` | PASS | 11 suites passed, 54 tests passed. |
| `npm run test:e2e -- --silent` | PASS | 1 suite passed, 6 tests passed. |
| `npm test -- --runInBand --silent` | PASS | 157 suites passed, 722 tests passed. |
| `npm run ios -- --list-devices` | FAIL / ENV | Fails at `xcodebuild -list -json`; `xcodebuild` is not installed on Linux. |
| `./android/gradlew --version` | FAIL / ENV | Wrapper attempted Gradle download from `services.gradle.org`; network unreachable. |
| `test -f ios/Podfile.lock && echo present || echo missing; test -d ios/Pods && echo pods-present || echo pods-missing; test -d ios/CravesMobile.xcworkspace && echo workspace-present || echo workspace-missing; test -f ios/GoogleService-Info.plist && echo firebase-present || echo firebase-missing` | PARTIAL / ENV | `present`, `pods-missing`, `workspace-missing`, `firebase-present`; native Pods/workspace still require macOS CocoaPods validation. |

## iOS Validation Status

Validated here:

- JavaScript/TypeScript unit, integration, e2e-model, visual-target, lint, and TypeScript checks pass on Linux.
- iOS native release guard markers are present for display name, `craves://` deep links, location/photo permission descriptions, payment app query schemes, privacy manifest declarations, React Native deep-link forwarding, and foreground current-location bridging.
- iOS native project files are present: `ios/CravesMobile.xcodeproj`, `ios/Podfile`, `ios/CravesMobile/Info.plist`, `ios/CravesMobile/PrivacyInfo.xcprivacy`, `ios/CravesMobile/AppDelegate.swift`, and `ios/CravesMobile/CravesCurrentLocation.m`.

Not validated here:

- iOS build with `xcodebuild`.
- iOS simulator launch or smoke testing.
- CocoaPods dependency resolution or install.
- Generated `.xcworkspace` integrity.
- iOS code signing, archive, export, TestFlight upload, or device install.
- Native iOS runtime behavior for Firebase, SecureStore, Razorpay, location bridge, push notifications, permissions, deep links, or app lifecycle.

## Blocker Matrix

| Blocker | Status | Evidence | Required owner/action |
| --- | --- | --- | --- |
| APIM mobile contract manifests | PASS / RECONCILE BEFORE FINAL RELEASE | `npm run check:p119` passes with 91 mapped mobile HTTP actions and hardened route-quality checks. | Reconcile sandbox manifests with APIM-published source-of-truth manifests before final release approval. |
| iOS Firebase plist presence | PASS / PLACEHOLDER RISK | `npm run check:ios-release` passes and `ios/GoogleService-Info.plist` exists in this sandbox. | Replace the non-secret placeholder with the real environment-specific plist through secure release prep before Firebase runtime validation. |
| CocoaPods lock/workspace | PARTIAL / MAC REQUIRED | `npm run check:ios-release` passes because `ios/Podfile.lock` exists; `ios/Pods` and `.xcworkspace` are still not generated on this Linux host. | Run `bundle install` and `cd ios && bundle exec pod install` on macOS, then verify generated release artifacts according to repo policy. |
| Xcode and simulator unavailable on this host | BLOCKS native iOS build/smoke | `xcodebuild`, `xcrun`, and `sw_vers` are command-not-found; `npm run ios -- --list-devices` fails at `xcodebuild -list -json`. | Execute native build, simulator launch, and smoke tests on a macOS release runner with supported Xcode. |
| Ruby/Bundler/CocoaPods unavailable on this host | BLOCKS pod install validation | `ruby`, `bundle`, and `pod` are command-not-found. | Use macOS release runner with Ruby, Bundler, and CocoaPods installed. |
| Android Gradle wrapper cannot initialize here | DOES NOT block iOS, but blocks Android cross-check | `./android/gradlew --version` fails downloading Gradle because network is unreachable. | Run Android validation on an environment with cached Gradle or network access if Android parity is required. |

## Required iOS Test Plan On macOS

Run on a macOS release machine with supported Xcode, Ruby, Bundler, CocoaPods, Node, and npm:

1. `npm ci`
2. `bundle install`
3. `cd ios && bundle exec pod install && cd ..`
4. Confirm `ios/Podfile.lock`, `ios/Pods`, and `ios/CravesMobile.xcworkspace` are generated and stable according to repo policy.
5. Provide `ios/GoogleService-Info.plist` through secure release preparation or CI secrets.
6. `npm run check:p119`
7. `npm run check:p120`
8. `npm run check:ios-release`
9. `npx tsc --noEmit`
10. `npm run lint`
11. `npm test -- --runInBand --silent`
12. `xcodebuild -workspace ios/CravesMobile.xcworkspace -scheme CravesMobile -configuration Debug -sdk iphonesimulator build`
13. `npm run ios -- --simulator "<target simulator>"`
14. Perform simulator smoke coverage for launch, auth/session restore, customer and chef role switching, discovery, cart/checkout handoff, payment failure/recovery paths, notifications surfaces, location permission/current location, deep links, offline/retry behavior, and logout.
15. For release candidate: archive/export from Xcode or CI, install on at least one physical iPhone, and repeat launch/auth/payment/location/push smoke tests.

## Native/Foundation Agent Update - 2026-09-22

Scope for this update:

- Edited only `ios/**`, `scripts/ios-release-readiness-check.mjs`, and this QA evidence file.
- Did not edit `src/features/**` or APIM contract manifests in this pass.

Native readiness patches:

- `ios/CravesMobile/AppDelegate.swift`
  - Added `import FirebaseCore`.
  - Added guarded `FirebaseApp.configure()` before React Native startup so Firebase Auth has native initialization on iOS.
- `ios/CravesMobile.xcodeproj/project.pbxproj`
  - Added `GoogleService-Info.plist` to the app group and Resources build phase.
  - Confirmed `PrivacyInfo.xcprivacy` remains in Resources.
  - Confirmed `CravesCurrentLocation.m` remains in Sources.
  - Confirmed Debug and Release use `PRODUCT_BUNDLE_IDENTIFIER = com.craves.mobile`.
- `ios/GoogleService-Info.plist`
  - Kept as non-secret placeholder only.
  - Aligned placeholder `BUNDLE_ID` with the current Xcode target bundle ID: `com.craves.mobile`.
- `scripts/ios-release-readiness-check.mjs`
  - Added guards for FirebaseCore import, `FirebaseApp.configure()`, Firebase plist Xcode resource membership, bundle ID marker, and Firebase plist bundle ID alignment.

Commands run after this update:

| Command | Result | Evidence |
| --- | --- | --- |
| `python3 - <<'PY' ... plistlib.load(...) ... PY` | PASS | Parsed `ios/CravesMobile/Info.plist`, `ios/CravesMobile/PrivacyInfo.xcprivacy`, and `ios/GoogleService-Info.plist`. |
| `node scripts/ios-release-readiness-check.mjs` | PASS | `iOS release readiness check passed.` |
| `npm run check:ios-release` | PASS | Release guard passed with Firebase native startup/resource checks. |
| `npx tsc --noEmit` | PASS | TypeScript completed with exit code 0. |
| `npm run lint` | PASS | ESLint completed with exit code 0. |
| `npm run check:p120` | PASS | `P120 observability audit check passed.` |
| Static Xcode wiring probe with Node | PASS | Confirmed Firebase plist resource, privacy resource, location source, and Debug/Release bundle ID markers. |
| `npm run test:integration` | PASS | 11 suites passed, 54 tests passed. |
| `npm run test:e2e` | PASS | 1 suite passed, 6 tests passed. |

Remaining external-only native gates:

- Replace the placeholder `ios/GoogleService-Info.plist` with the real Firebase iOS plist from Firebase Console or secure CI secret material before any real build or TestFlight candidate.
- Run `cd ios && bundle exec pod install` on macOS to generate a real `ios/Pods` tree, `ios/Pods/Manifest.lock`, and Xcode workspace state.
- Validate with Xcode/macOS tooling: `plutil`, `xcodebuild`, simulator launch, physical-device smoke, signing, archive/export, and TestFlight/App Store checks.
