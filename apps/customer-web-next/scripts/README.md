# Customer Web Build Scripts

## `extract-brand-logo.mjs`

Materializes the approved PNG already embedded in `public/brand/craves-logo.svg` as `public/brand/craves-logo.png` before development and production builds. It validates the PNG signature and minimum size before writing.

## `prepare-standalone.mjs`

Prepares the existing Next.js standalone runtime.

No script downloads a remote brand asset or accepts a credential.
