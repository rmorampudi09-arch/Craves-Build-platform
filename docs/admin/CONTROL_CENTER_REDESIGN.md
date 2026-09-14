# Craves administration — Delivery Intelligence design alignment

## Source and release scope

Prepared on 14 September 2026 from verified main
`f0ba9d64ad8ad98ce3a4da2dfac5cc9bcf953d49`.

This guide describes the original presentation/navigation shell and its session
safety follow-up. PR342 subsequently added the analytics/explorer module at
`6fc36ab8302366087b6248e5780e4896821b80dd`. That increment includes Auth, User/Chef
and Order APIs and audit migrations. Follow [the explorer release guide](explorer/README.md)
for the expanded review, index, route and deployment requirements. The earlier
frontend-only release description does not authorize or certify those dependencies.

The session follow-up was reconciled on that exact newer head and preserves its
analytics navigation and explorer code. Do not overlay an older ZIP or replace
newer main changes. Review the final integrated SHA before building. Preserve
existing resources, credentials, financial policy and the one-replica maximum.

## Visual system

The shared chrome follows `apps/delivery-intelligence-admin/src/app/dashboard-a.css`:
white navigation and surfaces, warm neutral canvas, red accents, restrained borders,
readable hierarchy and compact operational cards. No new purple theme or gradients.

| Role | Token |
| --- | --- |
| Craves red / action red | `#f62e18` / `#df2412` |
| Ink / secondary text | `#111111` / `#5f6064` |
| Soft surface / divider | `#fff5f3` / `#eadfdd` |
| Canvas / surface | `#f9f7f5` / `#ffffff` |
| Success / warning / information accents | `#1d9155` / `#ec9524` / `#286eca` |

`CravesLogo` remains the only logo component and uses the existing generated
`/brand/craves-logo-20260805.png`. No logo is redrawn, recoloured or replaced.
Small white button text uses the darker brand red (measured contrast 4.77:1).
Status is communicated with text as well as colour. Scoped styles leave the public
customer/chef sign-in journey unchanged. Academy retains its already branded,
purpose-built learning workspace.

## Implemented navigation and data coverage

The original shell has 13 destinations: Overview, Global search, All modules,
Orders & investigations, Delivery Intelligence, Chef applications, Account security,
Finance control center, Subscription plans, Subscriptions, Subscription capacity,
Notification recovery and Craves Academy. The explorer increment adds Marketplace
analytics plus Users, Chefs and Orders explorers, bringing the registry to 17.

The header offers keyboard-accessible module search (Ctrl/Cmd+K), a notification
recovery shortcut, current-workspace context and a native mobile navigation dialog.
Module search searches module names/tasks, not private customer data. Existing Global
search remains the audited route for identifying people and transactions.

Delivery Intelligence is an ordinary full-page navigation to its existing canonical
`https://admin.craves.in/delivery-intelligence` mount. It is a separate Next.js app;
a same-app RSC transition or a new deployment of that app is not required here.
It remains read-only: this release adds no dispatch, cancel, retry, reassign or
provider-enable buttons to that workspace.

The overview consumes only the existing validated `/api/admin/dashboard/summary`:

- Orders created in 24 hours; awaiting chef; preparing; ready for pickup;
  out for delivery; delivered updated in 24 hours; refunds pending; refunds failed.
- Backend snapshot time explicitly labelled in IST. Manual refresh, loading,
  unavailable/invalid responses, and a clearly marked last-successful snapshot.
- Recent exception snapshot: order/kitchen filter, status selector, sorting,
  five/ten-row pagination, full-reference disclosure and clipboard action.
  This list is not presented as the complete order history.
- All returned order-trend date buckets, exact chart data table, operational stages.
- CSV export of validated integer aggregate counters and their snapshot timestamp.
  It excludes customer/chef identifiers, transaction records and credentials.
- The module directory stays available when overview data is unavailable.

Finance, chef decisions, subscription changes, account interventions and notification
recovery continue to use their existing screens and owning-service checks.
No direct database-editing capability is added. A navigation entry is not a claim
that a module is deployed, enabled, healthy, or writable for the current account.

## Coverage deliberately not invented

This UI release does not implement new catalog/menu CRUD, promotion creation,
support-ticket operations, review moderation, an administrator-role editor,
manual refund execution, delivery dispatch, infrastructure toggles, or arbitrary
record editing. Those require verified service contracts, audit/permission rules
and their own acceptance tests; they must not appear as working dummy controls.
This release centralizes the inspected existing workspaces, not every potential
future platform capability.

## Authentication and safety

`PhoneAuthForm` is reused unchanged. Firebase OTP, captcha, session exchange and
HTTP-only cookie handling are not reimplemented. Admin portal login defaults to
`/admin`, preserves approved admin/Delivery Intelligence destinations, and does not
grant roles. Public and chef sign-in retain their existing presentation.

The workspace preserves the existing admin-session observer, renewal and logout.
An unsuccessful identity re-check clears the prior identity; the operational
workspace is hidden during re-verification/reconnection. Native dialogs close
when access becomes uncertain. Routine successful session checks continue to
revalidate identity without closing dialogs, hiding healthy work or moving focus.
Existing forms remain mounted while reconnecting when identity
is retained, to avoid discarding work. No sensitive data is stored in localStorage.

Administrator sign-out immediately locks local operational access. It is confirmed
only after the same-origin logout route returns a successful `signedOut: true`
receipt. Network failures, non-success statuses and invalid receipts show a locked
retry screen, including when sign-out starts from Academy. No operational mutation
is replayed after sign-out. The shared server logout route owns actual token
revocation and cookie handling; these client checks do not substitute for its
release acceptance.

## Validation evidence and required release gates

The session safety follow-up adds ten authorization lifecycle cases and
seven logout confirmation/concurrency cases. Local lint and full TypeScript checks
passed on the reconciled analytics head; the complete web test command passed
85 Vitest and 293 Node tests, with no
failures or skips. These use disposable in-memory responses, not live sessions.
Browser, authenticated runtime and deployment gates below still apply to the final
integrated release, including the independently owned shared logout server changes.

Completed locally on the prepared source:

- Eight Node tests: module coverage/unique routes; boundary-safe active links;
  task search; delivery-app navigation; administrator return targets; IST rollover;
  exact aggregate CSV; unsafe CSV names/non-count values.
- TypeScript transpilation syntax check: all nine TS/TSX files, zero diagnostics.
- Brand text-pair contrast calculations (not a full accessibility certification).

The original shell-only checks above do not certify the later analytics increment
or authenticated end-to-end testing, production rendering or deployment.
The existing `.github/workflows/admin-dashboard-ci.yml` performs lint, typecheck,
tests and production build on PRs. Require all applicable checks on the exact
reviewed head; do not relabel pending/failed checks as passed.

Before release, test at 320, 390, 768, 1024 and 1440 pixels; keyboard-only navigation;
Ctrl/Cmd+K, Escape and focus return; reduced motion; OTP/captcha and error messages;
unauthorized/expired/reconnecting sessions; successful, empty, malformed and failed
summary responses; filtering/paging; export contents; each existing mutation's audit
reason and authorization. Confirm Finance, Academy and standalone Delivery links.
Check the compatibility theme against every existing module, including portals and
third-party grids, instead of assuming that all legacy colour variants are covered.

Merge only after normal review. Use the current verified admin-web release pipeline
with an exact reviewed source SHA, preserve its deployment configuration and one
replica, and run authenticated acceptance on the admin domain. Do not deploy all
backend services for this change. Preserve the previous admin image/digest for
rollback. The explorer increment separately needs the three reviewed backend
dependencies described in its release guide; this is not a blanket fleet release.
A merged PR or green source build alone is not production acceptance.
