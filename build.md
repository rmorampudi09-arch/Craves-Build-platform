# CRAVES Mobile Build / Implementation Ledger

**Purpose:** Authoritative living control record for the current mobile rebuild. Detailed phase evidence remains under `docs/mobile-ui-rebuild/`; the pre-P126 expanded ledger is preserved at `docs/mobile-ui-rebuild/archive/BUILD_LEDGER_PRE_P126_2026-08-10.md`.

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Authoritative branch:** `mobile-ui-rebuild-from-scratch`  
**Mobile workspace:** `apps/mobile`  
**Backend/APIM guard baseline:** `8a2444cde508ea2fb20cb9822397e55c29bd8c5f`  
**Implementation guide:** full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`  
**Build policy:** code-level validation during implementation/QA phases; final signed APK/AAB, install/smoke, checksum/release notes, and rollback validation belong to P128 only.

---

## 1. Current Control State

- **P00–P119:** retain the exact DONE/PARTIAL/BLOCKED/QA-PENDING states recorded in their dedicated evidence and the archived pre-P126 ledger. This compact ledger does not reinterpret historical phase status.
- **P120 — Analytics/Observability Audit:** PARTIAL at full production/staged-observability scope. Evidence: `docs/mobile-ui-rebuild/P120_ANALYTICS_OBSERVABILITY_AUDIT.md`.
- **P121 — Unit/Component Test Completion:** DONE at authorized unit/component-test + CI scope. Evidence: `docs/mobile-ui-rebuild/P121_UNIT_COMPONENT_TEST_COMPLETION.md`.
- **P122 — Integration Test Completion:** DONE at authorized integration-test + CI scope. Evidence: `docs/mobile-ui-rebuild/P122_INTEGRATION_TEST_COMPLETION.md`.
- **P123 — Mobile E2E Regression Completion:** PARTIAL at full native/provider/device E2E scope; deterministic supported critical-journey coverage is implemented and validated. Evidence: `docs/mobile-ui-rebuild/P123_CRITICAL_E2E_JOURNEYS.md`.
- **P124 — Customer Visual QA Refs 1–18:** PARTIAL / QA PENDING; live Android device/emulator comparison remains pending. Evidence: `docs/mobile-ui-rebuild/P124_CUSTOMER_VISUAL_QA_REFS_1_18.md`.
- **P125 — Customer Visual QA Refs 19–37:** PARTIAL / QA PENDING; live device/emulator comparison remains pending and some reference states remain contract-blocked. Evidence: `docs/mobile-ui-rebuild/P125_CUSTOMER_VISUAL_QA_REFS_19_37.md`.
- **P126 — Chef Visual QA Refs 2, 4, 38–52:** PARTIAL / QA PENDING; deterministic target/source preflight is implemented and CI validated, while live Android device/emulator comparison remains pending. Evidence: `docs/mobile-ui-rebuild/P126_CHEF_VISUAL_QA_REFS_2_4_38_52.md`.
- **P127 — Final Regression and Production Readiness Review:** **DONE — REVIEW COMPLETE / RELEASE DECISION: HOLD.** All P127 in-repository regression/readiness gates are green at the validated code head; unresolved device/provider/operations/security/release items are explicitly retained as external release holds rather than misreported as complete. Evidence: `docs/mobile-ui-rebuild/P127_FINAL_REGRESSION_PRODUCTION_READINESS_REVIEW.md`.
- **P128 — Final Android Release Artifact:** **BLOCKED — ENTRY GATE NOT SATISFIED / NO PRODUCTION P128 ARTIFACT BUILT.** A later non-production ARM64 standalone testing APK was built successfully for customer-address/current-location validation, but it uses the repository debug keystore and does not satisfy P128 production-signing, install/smoke, release-checksum, or publication requirements.

**Current completed phase:** **P127 — Final Regression and Production Readiness Review**.

**Current authorized phase:** **P128 — Final Android Release Artifact — BLOCKED at release entry gate**.

> P127 being DONE means the review phase itself is complete under its acceptance rule that external blockers may be explicitly documented. It does **not** mean the full application is production-approved. Prior partial/QA-pending phases remain unchanged. The non-production ARM64 testing APK recorded below is validation evidence only and does not change the P128 HOLD decision.

---

## 2. P127 Completion Record

**P127 starting branch HEAD:** `d60b39eecffc33a91c1a0d2381f962043901cbbd`  
**Initial P127 readiness workflow commit:** `8854780f28e0860d1e91ccf208c5ef7beb883977`  
**P127 in-repo blocker-fix commit:** `6cbc8f843a8ffb147a2cc86cd9a340db84773a4b`  
**P127 final readiness-classification commit:** `bf332ac9ae6ba1c5171a6ab6b6910161e4a939fe`  
**Final P127 workflow run:** `31404009634`  
**Final P127 job:** `93505762066` — **SUCCESS**.

### Final green P127 automated gates

- Dependency installation — PASS.
- Production dependency vulnerability scan — EXECUTED; known high-severity `image-size` React Native/Metro toolchain advisory set was explicitly classified as an external release blocker for P127 closure only. Any critical or changed/unaccepted high-severity advisory set fails the classifier.
- Fresh backend/APIM/infrastructure source guard — PASS.
- TypeScript strict check — PASS.
- ESLint zero-warning gate — PASS.
- Full Jest regression + open-handle/React-`act` hygiene — PASS: **136/136 suites, 624/624 tests**.
- Dedicated integration regression + open-handle hygiene — PASS: **10/10 suites, 53/53 tests**.
- Deterministic critical E2E — PASS: **1/1 suite, 6/6 tests**.
- P119 APIM contract guard — PASS: **49** production mobile HTTP actions mapped across **20** call-bearing source files.
- P120 observability static guard — PASS.
- P127 source/secret/test-focus/release-config static guard — PASS.
- Production Android JavaScript bundle — PASS.
- Android release-configuration validation using `:app:signingReport` — PASS without building a P128 artifact.
- Final P127 aggregate readiness gate — **PASS**.

### In-repository blockers closed during P127 completion

1. **Debug release-signing fallback removed.** `release` no longer uses `signingConfigs.debug`. Secure production signing values are accepted only from external `CRAVES_ANDROID_*` environment/Gradle inputs. Without them, the release signing report remains unconfigured rather than silently using debug credentials. Real signing remains P128 work.
2. **Jest open-handle leak closed at test scope.** TanStack Query timers are unref'd only in Jest setup; production runtime cache timing is unchanged.
3. **React `act(...)` warnings closed.** Lifecycle primitive tests now flush asynchronous reduced-motion preference reads and unmount renderers inside `act`.
4. **Fresh backend source guard completed.** No backend/APIM/infrastructure source was modified by the mobile rebuild at the P127 validated code head.
5. **Production dependency scan completed.** The known `image-size` toolchain advisory is not hidden; it remains a Security/Release Engineering release hold.
6. **P127/P128 boundary corrected.** P127 validates Gradle signing configuration only; it does not build the final release APK/AAB.

---

## 3. Explicit External Release Holds After P127

These items are accepted **only as documented external blockers for P127 phase closure**. They remain unresolved for production-release approval:

- P124–P126 live Android device/emulator visual comparison and reference evidence.
- P113–P115 real-device accessibility, font scaling, keyboard/safe-area/responsive, and OS reduced-motion verification.
- P116 native runtime profiler/image-cache/performance closure and server-contract-dependent pagination boundaries.
- P123/P125 native/provider/device E2E and recorded product/backend contract boundaries.
- P120 approved staged/production external telemetry, monitoring, and alerting posture.
- Security/Release Engineering disposition of the known high-severity `image-size` React Native/Metro toolchain advisory set discovered by the production dependency scan.
- Cross-functional production sign-off required by the master guide.
- P128 secure production signing material, final APK/AAB build, artifact install/smoke, checksum/release notes, and rollback verification.

The application must **not** be described as fully production-ready while these release holds remain open.

---

## 4. P128 Authorized Attempt — Blocked Entry Record

**Phase:** P128 — Final Android Release Artifact  
**Status:** **BLOCKED for production release**  
**Started from commit:** `e270e0011cbac6888901d1f9ce821759b4ee496c`  
**Completed at commit:** N/A — blocked before production release-source or production-artifact implementation/build work  
**Guide references:** full 183-page master guide, especially pages 17–19 (Testing and Verification Standards, Production Readiness Checklist, Final Engineering Rules)  
**Changed files at blocked entry:** `build.md` only (control-ledger status; no application/release source changed)  
**APIM/contracts used:** none; P128 is packaging/release scope only  
**Behavior completed:** release entry-gate reconciliation against current P127 status, P128 phase contract, secure-signing boundary, and master-guide production-readiness requirements  
**Tests/checks:** no production P128 build/test workflow was run because the release entry gate failed before P128 production-artifact work was allowed; the later ARM64 testing build recorded in Section 5 is deliberately outside production P128 qualification  
**Visual QA:** not completed in P128; P124–P126 live Android comparison remains QA PENDING  
**Production artifact/provenance:** no production-signed APK/AAB generated; no production artifact identifier/checksum exists; accepted production release source commit is not yet designated  
**Signing:** no production credential or keystore was added to source; `apps/mobile/android/app/build.gradle` continues to require externally injected `CRAVES_ANDROID_*` production release-signing values. The testing APK in Section 5 intentionally used the checked-in debug keystore and is not a production release artifact.  
**Known blockers:**
1. P124–P126 live visual certification remains incomplete.
2. P113–P116 real-device accessibility/responsive/reduced-motion/performance closure remains incomplete.
3. P123/P125 native/provider/device E2E and product/backend contract boundaries remain unresolved.
4. P120 staged/production telemetry, monitoring, and alerting approval remains incomplete.
5. Security/Release Engineering has not recorded disposition/acceptance of the current high-severity `image-size` React Native/Metro toolchain advisory set.
6. Product, design, engineering, QA, security, and operations production sign-off is not recorded.
7. Secure production signing material / Play App Signing release path is not available to this repository execution and must remain external to source.

**Release qualification:** **HOLD — no production artifact may be claimed or published from this attempt.**  
**Next authorized phase:** **NONE — P128 remains the current blocked phase; resolve/explicitly accept the recorded release holds and re-authorize P128 before a final production-signed artifact build.**

---

## 5. Post-P127 Customer Address / Current-Location ARM64 Testing Evidence

**Purpose:** Device-installable validation artifact for the completed customer address/current-location implementation. This is **not** a P128 production release artifact.  
**Mobile source commit actually checked out by the workflow:** `a3fd61138e215e2eb2f17a707c446d459d94e6d5`  
**Workflow:** `.github/workflows/mobile-apk-arm64-build.yml` — `CRAVES Mobile ARM64 APK Build`  
**GitHub Actions run:** `31638174234`, attempt `2`  
**Job:** `94584718938` — **SUCCESS**  
**Architecture:** `arm64-v8a` only  
**Gradle command:** `./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon`  
**Runtime configuration:** workflow copied `apps/mobile/.env.example` to `.env`, therefore the standalone APK embeds the configured production APIM gateway origin from the repository example  
**Testing signing:** repository `apps/mobile/android/app/debug.keystore` via externally supplied Gradle environment variables in the workflow; **not production signing**  
**Build result:** `BUILD SUCCESSFUL`  
**Bundle verification:** `assets/index.android.bundle` exists in the generated APK  
**Signature verification:** `apksigner verify --verbose` PASS; APK Signature Scheme v2 verified  
**Artifact name:** `craves-mobile-arm64-standalone-testing-apk`  
**Artifact ID:** `9197459999`  
**Artifact ZIP size:** `19,689,127` bytes  
**Artifact ZIP SHA-256:** `ea1abceb871db4d5f456d412064a0049f17aa36f9c4d7fa760c2d46623fb2341`  
**Retention:** 7 days from workflow upload  
**Qualification:** installable/testing evidence only. It does not close P124–P126 visual QA, real-device E2E/accessibility/performance holds, production signing, P128 release checksum/release-note requirements, or production publication approval.

The workflow log confirms that the rerun fetched the live `mobile-ui-rebuild-from-scratch` branch and checked out `a3fd61138e215e2eb2f17a707c446d459d94e6d5` before dependency installation and the ARM64 build. This resolves the otherwise ambiguous original run metadata, which still references the older workflow-trigger SHA.

---

## 6. Phase Stop / Current Boundary

**P128 remains BLOCKED at its production release entry gate.**

A non-production ARM64 standalone testing APK now exists and is recorded above, but no production-signed APK/AAB, Play release artifact, production checksum/release notes, install/smoke certification, rollback artifact, or production publication was created. The testing artifact must not be represented as completion of P128.