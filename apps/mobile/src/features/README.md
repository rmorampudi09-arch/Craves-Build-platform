# Features

Each folder here is one feature of the Craves app (`cart`, `chefMenu`, `supportChat`, …), so a change to one feature cannot quietly break another.

```text
src/
  app/        navigation: may use any feature
  features/   one folder per feature
  shared/, core/, design/, utils/, types/   building blocks with no feature knowledge
```

## Rules (checked by `npm run lint`)

1. A feature uses its own files and the building-block folders. Nothing else.
2. The building-block folders never use a feature.

Some features still use each other: those links are listed in `feature-boundaries.json`, and the list can only shrink. If you need something from another feature, prefer moving it into `src/shared`. If the link is really intended, add it to the list in your PR so reviewers see it.
