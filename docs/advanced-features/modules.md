# Advanced features — module notes and decisions

Decisions made while building (the owner asked for no questions; each choice is the conservative one and easy to change).

## M01 Food lists (E04, E40)
- Lists are private. Sharing creates one link per list (`/l/<token>` on craves.in); the token is shown once and stored only as SHA-256. Rotating revokes the old link; revoking ends access at once. Optional expiry 1–365 days.
- A shared view shows list name, description and dishes with live availability. It never shows the owner, their other lists, addresses or orders. Anyone signed in can copy a shared list into their own lists.
- Limits: 50 lists per person, 200 dishes per list. Dish names are snapshotted so unavailable dishes stay understandable.

## M02 Group orders (E13)
- One kitchen per group (multi-chef economics is a product decision), host pays (split payments deferred by the handbook).
- Join with an 8-character code (`XXXX-XXXX`, 40 bits) inside a join window (15 min–24 h, default 60). After the window the group locks itself.
- Each person edits only their own dishes; the host can remove people, lock/unlock, cancel and hand off. Up to 20 people, 20 dishes each, 100 of one dish per order.
- Checkout hand-off re-reads live prices and refuses if any dish became unavailable. With `applyToCart=true` it fills the host's real cart through Order service (refuses a non-empty cart unless `replaceCart=true`); Order service stays the authority for the final total. Repeating the hand-off returns the stored result.
- Closed groups are purged after 30 days, abandoned ones 7 days after their window.

## M03 Food facts (E19)
- Chefs declare ingredients, allergens (FSSAI 2020 list plus common extras), "may contain", nutrition per serving and the source (chef-declared, lab-tested, label-derived). Ownership is confirmed with Catalog using the chef's own token.
- Submitting publishes the facts at once labelled CHEF_DECLARED (the newest recipe is the safest truth for allergens); staff verification relabels them VERIFIED. A rejection falls back to the last verified facts, or removes them.
- Plausibility checks (energy vs macronutrients, sugars vs carbohydrate, saturated vs total fat, nutrients vs serving size, missing evidence) are warnings, never blocks.
- "Free from" search only returns dishes whose facts were declared: unknown is never treated as safe. Every public answer carries a plain disclaimer.

## M22 Private taste data (E40)
- `GET /api/v1/my-taste-data/export` returns everything the advanced modules hold about the caller; `DELETE /api/v1/my-taste-data` with `X-Confirm-Erase: ERASE` erases it and keeps only a receipt (count and modules, no content).
- Consent switches (`personalization`, `productAnalytics`) default to off; later modules (personalized ranking, product analytics) must read them.
