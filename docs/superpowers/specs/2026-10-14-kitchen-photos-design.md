# Kitchen photos: registration photos go public, locked for chefs

Date: 2026-10-14. Approved by the product owner in chat the same day.

## Problem

Chefs upload two kitchen photos when they apply ("Overall kitchen photo" `KITCHEN_PHOTO_1`, "Cooking setup photo"
`KITCHEN_PHOTO_2`). They live in user-chef-service as private KYC documents (container `documents`) and never reach
the catalog. Catalog has one public `kitchen_profile.kitchen_photo_url` that the chef can upload, replace or remove
from Kitchen details at any time. Customers never see any kitchen photo: the kitchen page has an empty 200 px header
and the Chefs (Discover) cards use dish photos.

## Decisions (product owner, 2026-10-14)

1. When a chef application is APPROVED, its two kitchen photos become public on the chef's kitchen. Only those two
   documents; ID proofs and FSSAI are never copied.
2. Registration photos win: importing them replaces whatever kitchen photos the kitchen had.
3. Chefs cannot replace or remove kitchen photos. A chef whose kitchen has an empty slot (older chefs who applied
   before photos were collected) can add a photo into that slot once; it shows to customers at once.
4. Changing a photo later goes through Craves support: support clears the slot, then the chef adds a new photo.
5. Customers: the kitchen page header becomes a slideshow of the kitchen photos; the Chefs (Discover) cards lead with
   kitchen photos, then dish photos. Home "Top kitchens near you" cards keep dish photos.

## Design

**Slots.** A kitchen has two kitchen photo slots: slot 1 = existing `kitchen_photo_url`, slot 2 = new
`kitchen_photo_2_url`. Responses keep `kitchenPhotoUrl` (slot 1, for app 1.31-1.33) and add `kitchenPhotoUrls`: the
non-null slots in slot order (0, 1 or 2 https URLs).

**Import (pull).** Catalog owns its kitchen state, so catalog pulls. user-chef-service gains
`GET /internal/v1/chef-kitchen-photos/{slot}?identityId=` (header `X-Craves-Internal-Secret`) that streams the
photo bytes only when the identity has an APPROVED chef application and a non-removed, non-rejected
`KITCHEN_PHOTO_{slot}` document; otherwise 404. Catalog calls it for both slots and stores the bytes in the public
`media` container through the existing photo optimiser, sets both slots, deletes replaced blobs after commit, and
records `kitchen_photos_imported_at`. A kitchen is imported once: right after it is created (in the background, so
kitchen creation never waits or fails on it), and at catalog start-up for every kitchen not imported yet (the
backfill for existing chefs). A network or 5xx failure leaves the kitchen un-imported so the next start retries;
404 on both slots counts as imported (nothing to copy).

**Chef rules (catalog).** `POST /api/v1/kitchens/me/photos?kind=KITCHEN` fills the first empty slot, or answers 409
`KITCHEN_PHOTOS_LOCKED` when both are filled. `DELETE /api/v1/kitchens/me/photos/KITCHEN` always answers 409
`KITCHEN_PHOTOS_LOCKED`. Message: "Kitchen photos can't be changed. To change one, contact Craves support."

**Support.** `DELETE /api/v1/catalog/internal/kitchens/{kitchenId}/photos/{slot}` (catalog internal key) clears one
slot and deletes its blob after commit. Run from Cloud Shell; no admin screen in this change.

**Customer app.** Kitchen page: when `kitchenPhotoUrls` is not empty, the 200 px header shows `KitchenImageCarousel`
(auto-advances every 2 s, as on Home); otherwise it stays empty. Chefs (Discover) card strip: kitchen photos first,
then dish photos, no duplicates. Nearby and legacy kitchen lists carry `kitchenPhotoUrls`.

**Chef app.** Kitchen details "Photos": "Your picture" plus two tiles, "Overall kitchen" (slot 1) and
"Cooking setup" (slot 2). A filled tile shows the photo and tapping it shows the support message; an empty tile opens
Take a photo / Choose from gallery (no Remove). A 409 `KITCHEN_PHOTOS_LOCKED` shows the support message.

## Out of scope

Admin screen for kitchen photos; more than two photos; Home card images; publishing on document approval (it is on
application approval); copying FSSAI or ID documents (never).
