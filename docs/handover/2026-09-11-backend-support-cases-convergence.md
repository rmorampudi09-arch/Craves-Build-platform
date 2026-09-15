# Backend Support Cases Convergence

Date: 2026-09-11

## Purpose

Restore the already-designed customer, chef and back-office support-case implementation onto current `main` without merging the long-diverged backend consolidation PR #297.

## Backend capability

- CUSTOMER and CHEF context case creation, owned list/detail and requester messages.
- Cursor pagination ordered by `updated_at, id` for stable deep history.
- SUPPORT_ADMIN/ADMIN queue, exact case detail, assignment-to-self, public reply, internal note and status update.
- Requester views never expose internal notes or assignment/staff identity fields.
- Public support replies and meaningful status changes create one durable requester notification through the existing User/Chef notification outbox.
- Internal notes deliberately create no requester notification.
- Every query is ownership or role constrained; there is no marketplace-wide requester read path.

## Existing schema

The current canonical source already contains `V7__support_case_domain.sql`. This convergence restores the Java implementation and tests that own that migration; the migration is not edited, renumbered or repaired.

## Product-rule boundary

This module does not issue refunds, cancel orders or deliveries, award compensation, decide liability, define SLAs, or infer an outcome from a support category. It only provides an audited case and communication workflow. Financial and fulfilment mutations remain in their owning services and require approved rules.

## Primary paths

- `services/user-chef-service/src/main/java/in/craves/userchef/service/SupportCaseService.java`
- `services/user-chef-service/src/main/java/in/craves/userchef/support/`
- `services/user-chef-service/src/main/java/in/craves/userchef/web/SupportCaseController.java`
- `services/user-chef-service/src/main/java/in/craves/userchef/web/AdminSupportCaseController.java`
- `services/user-chef-service/src/main/java/in/craves/userchef/web/RequesterSupportView.java`
- `.github/workflows/backend-support-cases-ci.yml`

## Validation

The dedicated CI runs Java 21 Maven `clean verify`, support cursor/privacy tests, migration-presence checks and a sensitive-output scan.

## Runtime boundary

Source convergence and CI do not publish APIM operations or deploy User/Chef Service. Production deployment must use the existing guarded service/APIM pipelines and `Craves-Dev-Service-Connection`. No secret or new Azure resource is required.
