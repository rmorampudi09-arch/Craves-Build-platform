# One admin approval for chef publication

The existing chef application approval after document review is the only individual approval required to publish dishes. This applies to all approved chefs, irrespective of their state.

## Implementation

- Integration CatalogEligibilityService reads the fresh signed User/Chef approval authority directly.
- Every approved chef appears in the publication eligibility list. No tax profile, declaration year, turnover flag, bank profile or common withholding record is needed for publication.
- Pending, rejected and revoked applications do not receive publication permission. Incomplete or unavailable approval authority is rejected.
- The existing activated global finance policy remains an operating prerequisite. No additional per-chef approval is introduced.
- OrderFinancialQuoteService no longer treats an individual registration-review flag as a quote approval gate.
- Existing withholding rates and financial snapshots are retained. No policy rate, tax declaration, chef document, bank verification, payout activation, order or money movement is changed.
- The old tax-profile approval form is replaced by an explanation of automatic publishing approval; source counters remain available.
- The chef-menu error describes missing chef approval and no longer asks for a tax/fee review.

## Existing and future chefs

There is no bulk update or fabricated tax approval. Permission is derived from the existing APPROVED application on every read, including newly approved chefs. Removing admin approval removes publication permission on the next read.

## Geography boundary

Publication permission applies to every state. Existing checkout source still only accepts same-state Telangana orders. This change does not certify nationwide order accounting or delivery coverage, and does not substitute a Telangana state code for a chef's actual location.

## Validation and release

Unit tests cover all-state publication, ordering-independent tax information, stable approval fingerprints, revocation, incomplete authority, overflow and outage. Database regression covers existing current-year, stale-year and turnover-flagged tax records without granting permission to unapproved chefs. Shared-finance regression preserves individual withholding, frozen quote replay and one earning per delivered order.

Release requires successful exact-source regression before merging and successful merged-main regression before production deployment. The release verifier compares live eligibility with every signed approved chef, with no state filter or tax-review subtraction. Record live revisions and executed results in the release receipt.
