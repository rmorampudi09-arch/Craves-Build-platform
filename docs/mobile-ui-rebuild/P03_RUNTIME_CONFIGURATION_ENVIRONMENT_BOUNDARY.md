# P03 — Runtime Configuration and Environment Boundary

**Branch:** `mobile-ui-rebuild-from-scratch`

**Phase scope:** `phases.md` P03 only. No P04 design-token work is included here.

## 1. Runtime configuration owner

The existing mobile runtime configuration owner remains:

- `apps/mobile/src/core/config/runtimeConfig.ts`

P03 extends that existing boundary rather than introducing another environment/configuration system.

Runtime schema:

| Variable | Required at runtime | Purpose | Source-control rule |
|---|---:|---|---|
| `CRAVES_API_BASE_URL` | Yes | Base URL used by the central mobile HTTP client | Deployment-specific value must stay outside source control. |
| `CRAVES_ENVIRONMENT` | Optional | Explicit `development`, `staging`, or `production` environment identity. When omitted, development builds resolve to `development` and non-development bundles resolve to `production`. | Deployment-specific value should be injected by environment/CI. |

`getRuntimeConfig()` now:

- trims and normalizes the APIM/API base URL,
- throws `RuntimeConfigurationError` when the required base URL is absent or invalid,
- accepts only absolute HTTP(S) URLs,
- requires HTTPS outside development,
- rejects embedded URL credentials, query strings, and fragments,
- validates explicit environment names.

The central HTTP client continues to obtain the base URL only through `getRuntimeConfig()`; no screen-level environment access was introduced.

## 2. Environment file boundary

`apps/mobile/.env.example` is schema/documentation only and contains no deployment URL, token, API key, password, or other secret. Its endpoint is a reserved non-production placeholder.

The repository root `.gitignore` ignores `.env` and `.env.*` while explicitly allowing `.env.example`, so developer/release environment files remain outside source control.

Production/staging endpoint values are therefore external inputs and are not committed in the mobile source.

## 3. Android environment injection

`react-native-config` was already the approved runtime environment library, but Android `app/build.gradle` did not apply its `dotenv.gradle` bridge.

P03 adds only the required Gradle application line so Android builds can inject the selected environment file into the existing `react-native-config` native module. No application ID, SDK level, signing, React Native, Firebase, or other Android build behavior was changed.

## 4. Firebase Android configuration audit

Current Android Firebase wiring was inspected and retained:

- the root Android build declares the Google Services Gradle plugin dependency,
- the app module applies `com.google.gms.google-services`,
- `apps/mobile/android/app/google-services.json` exists,
- the Firebase Android client package matches the application namespace/application ID `com.cravesapp`.

The Firebase client configuration file is platform configuration, not a location for CRAVES backend secrets. No Firebase server credentials, service-account private keys, refresh credentials, or backend secrets were added by P03.

## 5. Feature flags / remote configuration audit

No feature-flag reads, Firebase Remote Config SDK dependency, or established remote-config provider currently exists in `apps/mobile`, and no current P00–P03 product behavior consumes a feature flag.

P03 deliberately does **not** invent remote-config keys/defaults or add an unused provider merely to simulate completion. This follows the repository rule that backend/runtime product decisions must not be fabricated.

For future phases, feature-flag-backed behavior must be introduced through one centralized, typed provider and the approved global-state ownership; screens must not read arbitrary environment variables or contain ad hoc local flag conditionals. Exact keys, defaults, rollout semantics, fetch/cache policy, and provider must be approved before any flag-controlled production behavior is claimed complete.

This is an explicit future integration boundary, not a blocker to P03 acceptance because no current feature requires remote-config behavior.

## 6. Validation added

Focused Jest coverage was added in:

- `apps/mobile/src/core/config/runtimeConfig.test.ts`

Coverage includes:

- environment selection,
- URL normalization,
- missing base URL failure,
- invalid environment failure,
- HTTPS enforcement outside development,
- development HTTP support for local/emulator endpoints,
- rejection of credentials/query/fragment material in the base URL.

The repository implementation CI remains the required code-level gate: dependency install, strict TypeScript, ESLint, Jest, production Android JavaScript bundling, and backend/APIM/infrastructure source guard.

## 7. P03 acceptance mapping

| Acceptance requirement | Result |
|---|---|
| Runtime config fails clearly when required values are missing | Satisfied by typed `RuntimeConfigurationError` and focused tests. |
| `.env.example` remains non-secret | Satisfied; production URL removed and replaced by a reserved placeholder. |
| Production values are externalized | Satisfied for mobile runtime endpoint/environment values. |
| Environment schema/APIM base URL injection verified | Satisfied; single runtime owner retained and Android dotenv bridge wired. |
| Firebase Android configuration verified | Satisfied statically; existing package/plugin configuration retained. |
| Feature flags/remote config mechanism verified | Audited: no current mechanism/consumer exists; future flag behavior is prohibited from using ad hoc conditionals until an approved centralized provider/key contract is introduced. |
| Backend/APIM/infrastructure source changed | No. |
| APK built | No, per phase policy. |

## 8. Phase boundary

P03 contains runtime/environment hardening and audit only. **P04 — Design Token Baseline has not been started.**
