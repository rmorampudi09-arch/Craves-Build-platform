# Admin-Published Mobile Home Banners

Precise banner-only change on `KUSHIRAVI-app-build`. No customer-web deployment,
auth policy, finance, payment, order, delivery or Chef operation changes.

## Source and runtime baselines

- Catalog image: `cravesrm09prodlow6bf632.azurecr.io/craves/catalog-service@sha256:98c7c618569c2b7f6fdd8b924be0894e744e750da6473cac1403e73fe07bb4ac`.
- Admin source: `92e446213fe8b0a3de8c5c71ef48eaf13765c6c2`.
- Admin image rollback: `cravesrm09prodlow6bf632.azurecr.io/craves/admin-web@sha256:1bc7e87cd534ba286077c830da2c41b2a758b849c8f0673099dfa4872d36e517`.
- Installed mobile baseline: `KUSHIRAVI-app-v1.21`, code 32 / name 1.21.

The current main branch and live Admin module list contained no banner publishing
feature. Mobile used three bundled promotional images with unsupported discount
claims. Those references are replaced with the owning backend's published feed.
Existing carousel size, position, press destination, paging and 5-second timer
are preserved. No banner is invented when the feed is empty or unavailable.
Home focus, 30-second polling while visible, and pull-to-refresh reload the feed.

## Contract

- Public `GET /api/v1/catalog/banners`: `{ "banners": [...] }`, only published
  records in position/creation/id order. Each record includes id, label,
  imagePath, published, sortOrder, createdAt and updatedAt.
- Public `GET /api/v1/catalog/banners/{id}/image`: published JPEG/PNG only;
  404 for drafts or missing records. Public browser image cache: 300 seconds.
- Admin `GET /api/v1/catalog/admin/banners`: PLATFORM_ADMIN or AUDIT_ADMIN.
- Admin `POST /api/v1/catalog/admin/banners`: PLATFORM_ADMIN; multipart fields
  file, label, sortOrder; always creates a draft.
- Admin `PUT /api/v1/catalog/admin/banners/{id}`: PLATFORM_ADMIN; JSON label,
  sortOrder, published, expectedUpdatedAt; stale edits fail with 409.
- Admin image preview: `GET /api/v1/catalog/admin/banners/{id}/image` with the
  same reader authorization, private/no-store.
- Admin UI: `/admin/banners`; cookie-authenticated BFF `/api/admin/banners`.
  Existing live admin verification, token revocation and same-origin guards
  remain in force. Client images never receive access tokens or storage keys.

## Storage, limits and scale

V8 adds only `catalog_schema.home_banners` and `home_banner_audit`. Images use
the existing database, not a newly public storage container. Inventory is bounded
at 20 images, 2 MiB each, 4096 pixels per dimension and 8 megapixels. JPEG/PNG
are decoded and content-type verified; SVG, arbitrary URLs and oversized uploads
are rejected. Label limit: 160; sort position: 0-999. No fabricated campaign,
discount, location-targeting or finance rules. Upload/publish/unpublish are audited.

Small public feed cache is 5 seconds per replica; image cache is bounded at
20 entries / 40 MiB and 30 seconds. Same-replica writes evict cached content.
Other replicas may retain feed for 5 seconds and image for 30; existing client
image caches may retain previously public artwork for 300 seconds. Unpublishing
removes it from newly refreshed mobile feeds. It cannot revoke copies already
downloaded. Admin responses are never publicly cached.

This bounded banner inventory is not a claim that the current production-low
infrastructure supports one million concurrent users. At that target, image
delivery needs dedicated object-storage/CDN capacity and load verification.
No new paid resource or public storage access is provisioned here. Existing
registry builds, container execution and database storage still incur normal usage.

## Rebuild and tests

Requirements: PowerShell 7, Java 21, Maven, Node compatible with the pinned
Admin packages, Azure CLI with access to the existing registry.

```powershell
./catalog/Fetch-Baseline.ps1 -OutputDirectory C:/mscratch/artifacts/banner-rebuild/input
./catalog/Build-Patch.ps1 -BaselineJar C:/mscratch/artifacts/banner-rebuild/input/app/app.jar -OutputDirectory C:/mscratch/artifacts/banner-rebuild/output
mvn -f ./catalog/pom.xml -B -ntp -Dbaseline.jar=C:/mscratch/artifacts/banner-rebuild/output/baseline-classes.jar test
```

Build-Patch compiles against the actual live classes/dependencies, adds only the
banner package and V8 migration, and verifies every existing archive entry is
byte-for-byte unchanged. No dependency replacement or security class edit.

For Admin, extract the exact baseline's `apps/customer-web-next`, then copy
`admin/` over that app root. Install its unchanged package lock; run typecheck,
changed-source lint, Vitest and Node tests. Full test fixtures need the complete
baseline repository, not just the app directory. Limit local Vitest workers when
building Android on the same machine. Build with Dockerfile.admin and the same
existing NEXT_PUBLIC build arguments. Non-root readable public/static file modes
preserve the live permission repair. Deploy only the existing Admin container.

No pipeline or GitHub remote changes. APIM's existing Catalog wildcard operations
already route this namespace; do not weaken global policies or add open proxies.

For mobile, run `tsc --noEmit`, Jest and the existing
`scripts/build-kushiravi-release-apk.ps1`. React Native type checking excludes
deployment overlays, which have their own web/backend verification.

## Manual verification

1. Open the approved administrator session at `/admin/banners`.
2. Upload the existing approved Craves artwork as a draft; confirm it is absent
   from the public feed and public image access returns 404.
3. Publish it; verify the feed returns the same ID and image bytes.
4. Replace-install the tagged APK without clearing app data. Open customer Home,
   pull to refresh, and confirm the same artwork appears instead of bundled promos.
5. Unpublish; refresh Home and confirm it disappears. Republish the approved
   image and confirm its return. Do not create offers, orders, payments or accounts.

Rollback: restore the two exact baseline container images and replace-install
the previous mobile checkpoint as appropriate. Do not drop the additive banner
tables or erase the audit/history. Existing tags and APKs remain untouched.
Exact build, deployment and installation receipts are recorded in version notes
and `docs/home-banners-20261002.md` after real verification.
