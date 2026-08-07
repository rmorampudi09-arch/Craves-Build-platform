# CRAVES Mobile — Phase 1

Fresh React Native CLI + TypeScript Android foundation. No source from the deleted mobile UI is reused.

## Implemented
- Native startup/session restoration.
- Customer/Chef role selection.
- Firebase native phone OTP sign-in and resend flow.
- Firebase email/password sign-in and password reset; Craves backend still requires a verified phone claim during token exchange, so email users without a linked verified phone are routed to phone verification.
- Craves Auth Service integration: firebase exchange, refresh rotation, /me, logout.
- Access token only in process memory.
- Refresh token persisted with `expo-secure-store` under `refresh_token`.
- Customer profile registration against existing User/Chef Service.
- Chef application creation/status routing against existing User/Chef Service.
- Account status and startup recovery states.

## Backend policy
No backend code or backend contract is modified by Phase 1.

## Runtime
Copy `.env.example` to `.env` or inject `CRAVES_API_BASE_URL` in CI/local environment. Firebase Android configuration is supplied through `android/app/google-services.json`.
