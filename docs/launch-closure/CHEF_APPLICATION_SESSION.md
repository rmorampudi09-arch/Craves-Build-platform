# Chef application session recovery

The post-release browser check of web release 39124 exposed independent application
and document reads occurring before the email/bank panels recovered an expired
access session. Retrying documents succeeded without another login, but the form
remained blank with a Loading heading and enabled submission.

The application page now mounts its private sections only after the existing Auth
session recovery completes. This boundary accepts active applicants without CHEF
approval; it does not bypass any backend ownership or business approval checks.
Owner/session changes remount private children. Same-owner email updates retain
input. A 15-second bounded screen check exposes Retry and Sign in, never an
indefinite spinner or automatic application submission. The shared Auth request
may finish after that screen timeout, but cannot mark that attempt accepted.

The application form also blocks editing/submission until its data is available,
replaces the misleading Loading heading on failure and provides Retry application.
No backend route, payment setting, identity record or bank enrollment is changed.

Local test: from apps/customer-web-next run npm run typecheck, npm run lint,
and npx vitest run src/lib/chef-application-session.vitest.ts
src/lib/chef-document-states.vitest.ts src/lib/chef-profile-session.vitest.ts.
Deployment requires passing exact-head regression and the existing guarded web
pipeline. After release, reload an expired signed-in application page; confirm
approval, document history and verified email agree without manually signing in.
Real upload and bank enrollment acceptance remain separate, uncompleted journeys.
