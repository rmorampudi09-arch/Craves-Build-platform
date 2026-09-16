# Chef application document readiness correction

## Observed problem

The owner-controlled signed-in chef application displays the independently verified email correctly. Its existing application is already approved, but current per-document history is empty. Do not create documents, alter approval, or equate that old approval with four current document approvals. A fresh chef signup/verification/submission and legitimate required uploads remain separate acceptance.

The previous document panel silently returned on application/evidence HTTP failures, so an unavailable history could be rendered as zero uploads. It polled indefinitely until an application appeared and exposed disabled upload controls to approved chefs alongside contradictory instructions.

## Changed files

- `apps/customer-web-next/src/components/chef-application-document-panel.tsx`: explicit loading, bounded read timeout, safe errors and user retry; failed history is never rendered as empty. Aborts stale/unmounted reads, replaces continuous polling with a submission event and manual refresh.
- `apps/customer-web-next/src/components/chef-application-workspace.tsx`: publishes an in-page refresh event only after a successful application submission.
- `apps/customer-web-next/src/components/chef-application-evidence-uploader.tsx`: truthful approved-but-incomplete history; preserves backend approval and document locks; no impossible upload instructions for approved accounts; white background/existing primary brand token; upload timeout, basic size/type validation, cleanup on navigation and reduced-motion support.
- `apps/customer-web-next/src/lib/chef-document-states.vitest.ts`: isolated rendered component tests using synthetic records and mocked requests only.

## Testing and release

Run the new `chef-document-states.vitest.ts` suite, existing email verification UI suite, lint, types and the complete web regression. This work adds no dependency or database migration and changes no payment, email verification or approval policy. Use the existing exact-main tested, immutable-image web release procedure; do not deploy an arbitrary stale branch over the owner's landing page update.

Manual acceptance: open the existing application, verify the real verified-email label, confirm incomplete history is clearly identified without claiming document approval, test an interrupted history read and Retry, and check a legitimate pending application with owner-supplied documents. No identity document upload or bank change was performed by this correction.
