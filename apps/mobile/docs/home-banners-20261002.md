# Home Banner Deployment Receipt - 2026-10-02

## Request and scope

The user asked for administrator-uploaded banners to appear in the mobile home
carousel, instead of random bundled promotional images. The user authorized the
banner-specific backend/admin/mobile work and one real Admin upload test. Nothing
else in authentication, payments, finance, delivery, orders, Chef flows or home
design was authorized or changed. No GitHub push.

Initial clean branch `KUSHIRAVI-app-build`, HEAD
`04cae95fe933f0e88a6173da4752758298bc4692`. Installed baseline was v1.21 / code 32.
Fetched current main and exact live Admin source read-only. Did not switch to or
edit the original mobile source branch, main, or other worktrees. Project mirror
`sources/` remains read-only.

## Finding

`src/features/home/components/HomePromoAndKitchens.tsx` used three local images
and invented percentage/price promotion labels. Neither the current main source
nor the exact live Admin source/module directory contained banner management.
APIM had no explicit banner module, but the existing Catalog wildcard operations
already routed the required namespace. No duplicate marketing backend existed
in the inspected authoritative sources or the relevant deployment records.

## Exact source and installation

- Source commit: `b9be7ea33ab8a3fcd615beac491a32f708a01bef`.
- Immutable installable tag: `KUSHIRAVI-app-v1.22`.
- Package: `com.cravesapp`; versionCode 33; versionName 1.22.
- Build: existing `scripts/build-kushiravi-release-apk.ps1 -SkipNpmCi -PhoneOnly`.
  Gradle success, 864 tasks / 44 executed, 7 minutes 57 seconds. ARM64 phone build.
- APK: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.22.apk`.
- APK SHA256:
  `F0FD0ACF219ACDB3DE54DBC6703425C7500752204AAA094B488C8C4D39724B6A`.
- APK v2/v3 signatures verified; same Version 1 phone signing certificate:
  SHA256 `FAC61745DC0903786FB9EDE62A962B399F7348F0BB6F899B8332667591033B9C`.
- Replace-install: Success; no uninstall, clear-data or account manipulation.
- Device: `RS7PB6VOY9ZLLFYD`, RMX5003; package lastUpdateTime
  `2026-10-02 06:59:10` Asia/Calcutta. Native package readback confirms 33 / 1.22.
- Source ZIP: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.22-source.zip`.
- ZIP SHA256:
  `7F24274B4C273CB5A99AAB0F49D1F5ABE702E667B1FD5CF6BB75D87D14E86A2D`.
- ZIP has 3,355 archive entries. Version, banner API/carousel, build script and
  debug-signing input were inspected against the built checkout. Text was compared
  after Git newline normalization; signing bytes match. No second full clean ZIP
  build was performed. Build dependencies remain pinned as in the local branch.

The phone was on OTP verification after opening. Requested that the user finish
sign-in and open customer Home. The agent did not enter an OTP or request one in
chat. A temporary login screenshot was discarded. No customer Home visual proof
is claimed yet. API verification and install success do not substitute for that
native visual check.

## Deployed backend

Existing subscription `721906c9-4a72-4606-830b-d3e7ace093ff`, resource group
`rg-craves-prodlow-centralindia`, registry `cravesrm09prodlow6bf632` reused.

Catalog exact rollback image:
`cravesrm09prodlow6bf632.azurecr.io/craves/catalog-service@sha256:98c7c618569c2b7f6fdd8b924be0894e744e750da6473cac1403e73fe07bb4ac`.

New Catalog image:
`cravesrm09prodlow6bf632.azurecr.io/craves/catalog-service@sha256:c7792c391e7dbac986c420394ea452092039c84f1b6c2eec29dd768a632ebf0c`.
ACR build `cu4y`; healthy running one-replica revision
`ca-craves-catalog-service-prodlo--home-banners-1002`. Image-only update of the
existing app. New classes compile against the actual live JAR and dependencies;
all old archive entries were verified byte-for-byte unchanged. No replacement
security, finance, media, discovery or kitchen class. Flyway applied V8 to
`catalog_schema`; logs confirm the new migration, without manual business edits.

Compared all 24 environment entries logically with prior ready revision 0000009:
literal values and secret references unchanged. CPU 0.25, memory 0.5 GiB and
replica min/max 1 unchanged. Azure's response materialized existing defaults such
as polling/cooldown and ephemeral-storage metadata, and null/empty value fields
beside secret references differ. A raw unordered JSON hash was not accepted as
proof of a functional configuration change or of equality. No secret was changed
or displayed.

Admin exact source: `92e446213fe8b0a3de8c5c71ef48eaf13765c6c2`.
Rollback image:
`cravesrm09prodlow6bf632.azurecr.io/craves/admin-web@sha256:1bc7e87cd534ba286077c830da2c41b2a758b849c8f0673099dfa4872d36e517`.

New Admin image:
`cravesrm09prodlow6bf632.azurecr.io/craves/admin-web@sha256:750cccb048743cf4e15d118e53d9ec9af93c15793eadbe3296460c9a3aa8574c`.
ACR build `cu50`; healthy running one-replica revision
`ca-craves-admin-r92-ffe80e7c--home-banners-1002`. Updated only the existing
replacement Admin app. Its environment/resources/scale/identity/ingress matches
the pre-deployment fingerprint after ignoring JSON top-level key ordering.
The live source's earlier packaging-only non-root file-permission repair is
preserved. Comparing 630 original Admin source/Docker files finds only the banner
navigation entry, its count test, and Docker permission lines changed; all other
original files match. New files are only the banner page, component, BFF, contract
and tests. Original lockfile and dependencies unchanged.

Existing Front Door Admin origin stays
`ca-craves-admin-r92-ffe80e7c.yellowdesert-9c7110ab.centralindia.azurecontainerapps.io`.
Existing APIM `craves-catalog-v1` wildcard operations and serviceUrl reused.
No APIM/Front Door policy edit, new service/resource, role assignment, credential
change, pipeline change or customer-web deployment. Existing dual MSG91 web/mobile
deployment and Pidge coordinate fix remain untouched.

## Live upload and publish evidence

Used the signed-in approved administrator session at
`https://admin.craves.in/admin/banners`. Did not read browser credentials or use
an artificial session. Uploaded through the visible file picker and upload button.

Approved source artwork was the existing web asset
`public/home/cravings/craves-home-banner.webp`: Craves homemade-food artwork, with
no new discount or price claims. Converted format only to JPEG using the existing
image library, no new branding or illustration.

- Upload file:
  `C:\mscratch\artifacts\home-banners-20261002\craves-approved-home-banner.jpg`.
- Image: 1983 x 793; 438,644 bytes.
- Banner ID: `50fe8e74-8397-4ab8-8a84-560d43851e21`.
- Label: `Craves homemade food`; position 0.
- Draft upload UI confirmed success. Public feed count 0; anonymous image access
  denied with HTTP 403 under existing protected error dispatch. Native controller
  throws 404 for a missing published record; no security bypass was added.
- Published via the existing new banner toggle; UI confirmed `Banner published.`.
  Public feed returned that exact ID and image path. Public image request succeeded.
- Uploaded and publicly served image SHA256 both:
  `FBA1A8E7BCF55C96C489DA4F10D5F9670DE9C911DDC093D2E767F30816FC251D`.
- Admin image decoded at natural size 1983 x 793; loaded=true.
- Unpublish confirmed `Banner saved as a draft.`; public feed count 0.
- Republished the same approved image and left it live; no additional promotion,
  order, paid transaction, customer account or Chef decision was created.

Evidence directory: `C:\mscratch\artifacts\home-banners-20261002`.
Admin screenshots `admin-draft.jpg` and `admin-published.jpg`; public image
`published-banner.jpg`; full Admin test receipts `admin-vitest.log` and
`admin-node-tests.log`. Do not treat an Admin screenshot as phone-render proof.

## Changed paths

All source changes are under `C:\mscratch\apps\mobile`:

- `src/features/home/api/homeBannerApi.ts` and `.test.ts`: bounded published-feed
  validation, gateway-only image references, no remote/fake fallback.
- `src/features/home/query/homeBannerQueries.ts`: public query, focus/mount and
  visible-home 30-second refresh.
- `src/features/home/components/HomePromoAndKitchens.tsx`: replace only carousel
  data; preserve existing banner styling and kitchen cards.
- `src/features/home/screens/CustomerHomeScreen.tsx`: invalidate banner query on
  existing pull-to-refresh; no layout or gesture implementation change.
- `android/app/build.gradle`: 33 / 1.22 only.
- `tsconfig.json`: exclude independently verified web/backend overlays from the
  React Native TypeScript program.
- `backend-patches/home-banners-v1/catalog`: four new banner classes, focused tests,
  additive V8 migration, exact-runtime fetch/build helpers, test POM and Dockerfile.
- `backend-patches/home-banners-v1/admin`: banner-only page/component/BFF/contracts
  and tests, one module navigation entry/test, preserved Docker permission repair.
- `backend-patches/home-banners-v1/.gitignore`, `README.md`.
- `KUSHIRAVI_VERSION.md`, this deployment receipt.

## Test results and limitations

- Mobile TypeScript: pass. Changed-source lint: pass.
- Mobile: 203 Jest suites / 1,096 tests, all pass; 8 new banner API tests included.
- Backend: 7 focused tests pass; production-baseline compilation/archive comparison
  pass. Real migration/upload/update/read paths exercised live through Admin.
- Admin TypeScript and changed-source lint: pass.
- Admin: 40 Vitest files / 422 tests pass; 334 Node tests pass.
- Initial Admin validation lacked root repository fixtures, then was corrected by
  extracting the exact full baseline. Initial workers/resource and 5-second test
  timeouts were re-run with 2 workers and 15-second test limit. No failure was
  silenced or test skipped.
- Existing Admin dependency audit: 10 issues, including 1 critical. No unrelated
  dependency upgrade in this precise banner task. This receipt is not a claim that
  all platform security/dependencies or all commercial journeys are launch-ready.
- The critical finding is Next.js 16.3.5 / GHSA-vcvr-r3jv-pc5j. The maintainer
  advisory describes Node.js `next/og` ImageResponse with attacker-controlled SVG
  values and lists 16.3.6 as patched. A source search found no `next/og` or
  `ImageResponse` use in this app; that is not a blanket security clearance. The
  banner path serves validated image bytes, not generated SVG. Separate dependency
  maintenance remains recommended, without silently expanding this change.
  Source: https://github.com/advisories/GHSA-vcvr-r3jv-pc5j
- Native Home visual verification pending user sign-in. Existing Chef/orders,
  payments, delivery and auth flows were not changed or re-validated by making
  live paid/irreversible operations.
- Public image cache and prior downloads cannot be revoked instantaneously by
  unpublishing; newly refreshed feeds exclude the image. See README cache limits.
- Bounded image storage/cache is not a million-user load-capacity guarantee.

## Manual verification still required

1. Finish sign-in on the connected phone, without sending the OTP in chat.
2. Open customer Home and pull to refresh. Confirm the approved Craves homemade-
   food banner replaces the three bundled promotions in the same carousel.
3. Check existing nearby kitchens, mind rail and bottom menu remain unchanged.
4. In Admin Home banners, toggle Published off, refresh phone Home and confirm
   disappearance. Turn it back on and confirm its return. Wait for visible-home
   polling or pull-to-refresh; do not create an order or payment to test banners.
5. Upload future approved JPEG/PNG artwork as a draft, then publish deliberately.

No Azure console, secret, signing-key or app-store action is required for this
phone test. The user-only sign-in is the current blocker to native visual proof.

## Rollback

Keep `KUSHIRAVI-app-v1.21` and all earlier tags/APKs untouched. Source rollback:
`git switch --detach KUSHIRAVI-app-v1.21`; do not commit future work on a detached
tag. Return to the approved app branch for updates. Android version downgrade
may require an explicitly approved downgrade procedure; do not uninstall/clear
data just to make it install.

Restore the two exact baseline Catalog/Admin image digests listed above for a
backend/admin rollback. Additive banner tables and audit should remain; do not
drop data or alter other services, permissions, MSG91 widgets or delivery settings.
Git tags restore source only, not external container images or banner publication
state. No previous checkpoint was overwritten or deleted.
