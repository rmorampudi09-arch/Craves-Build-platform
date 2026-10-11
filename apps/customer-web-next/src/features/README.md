# Features

Every part of craves.in lives in its own folder here, so a change to one feature cannot quietly break another.

```text
src/
  app/        URLs only (Next.js pages, layouts and /api routes). Keep them thin: they show a feature.
  features/   one folder per feature (below)
  shared/     building blocks with no feature knowledge: ui/ kit, styles/, lib/ (fetch, BFF and security helpers), utils/
  tests/      checks that span the whole site
```

Inside a feature, use the same sub-folders when you need them: `components/`, `screens/` (whole pages), `lib/` (contracts, logic and their tests), `api/` (browser calls to our `/api`), `styles/`, `assets/`.

| Feature | What it owns |
|---|---|
| `landing` | The public landing page (craves.in) |
| `sign-in` | Sign up and sign in journeys: phone OTP, email verification, the landing sign-in popup |
| `auth` | The signed-in session: identity, cookies, refresh, logout |
| `customer-shell` | Customer navigation that ties features together (bottom bar, browse header, service nav) |
| `home` | Signed-in home: browse dishes and kitchens, categories, search |
| `dish` | Dish details page |
| `chefs` | Public chef and kitchen pages |
| `cart` | Cart |
| `checkout` | Checkout and payment |
| `orders` | My orders, order status and tracking |
| `addresses` | Delivery addresses, location search and maps |
| `profile` | Profile and account details |
| `favorites` | Favourites (wishlist) |
| `notifications` | Notifications inbox |
| `meal-plans` | Customer meal plans (subscriptions) |
| `support` | Support chat |
| `legal`, `seo` | Policy pages; search engine metadata |
| `chef` | Home chef workspace: orders, menu, kitchen, earnings, capacity, meal plans |
| `chef-onboarding` | Become a chef: application, documents, review status |
| `admin` | Admin portal, one sub-folder per area (`shell`, `finance`, `explorer`, …) |
| `pilot-launch` | Launch gate for the pilot |

## Rules (checked by `npm run lint`)

1. A feature uses its own files and `src/shared`. Nothing else.
2. `src/shared` never uses a feature.
3. New files go in `src/features/<feature>/…` or `src/shared/…`, never in new top-level folders.

Some features still use each other: those links are listed in `feature-boundaries.json`, and the list can only shrink. If you need something from another feature, prefer moving it into `src/shared`. If the link is really intended, add it to the list in your PR so reviewers see it.

## Adding a feature

Create `src/features/<name>/`, put its code there, and add a thin page under `src/app/<url>/page.tsx` that renders it. Tests sit next to the code they test (`*.test.ts` for Node, `*.vitest.ts` for Vitest); both runners pick them up anywhere under `src/`.

## A branch started before the move?

Open a PR and a bot brings it over for you (merges main, moves your files, rewrites old paths) and pushes only if lint, types and every test pass. To do it yourself, run `bash apps/customer-web-next/scripts/features/update-branch.sh` from the repository root; it stops at each set of conflicts, so fix them, commit and run it again. `scripts/features/feature-map.json` lists where every old file went.
