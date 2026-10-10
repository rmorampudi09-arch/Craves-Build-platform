# Interactive Ola maps (web live, APK ready) — 2026-10-10

## TL;DR

| Question | Answer |
|---|---|
| What changed for customers? | The address map on craves.in is now a real map. Customers pan and zoom, and the red pin stays in the centre, Swiggy-style. The address under the pin resolves when the map settles, and "Locate me" jumps to GPS. The same picker is used in the chef kitchen forms. |
| Which SDK? | **MapLibre**, on Ola's official vector tiles and default style. On the web this is `maplibre-gl` 6.13.0 (BSD-3-Clause). The APK uses `@maplibre/maplibre-react-native` 11.5.0 (MIT), which wraps MapLibre Native (BSD-2-Clause). |
| Why not Ola's own SDK packages? | They are thin wrappers around the same MapLibre engine. `olamaps-web-sdk` is `new maplibregl.Map` plus an `api_key` request transform plus a logo, and is proprietary ("All rights reserved"). The Android SDK is a manually downloaded `OlaMapSdk-1.0.0.aar`. There is no React Native SDK. Ola's T&C forbid "outdated versions of the Platform or Ola Products", which a pinned binary AAR would drift into. MapLibre is open source with a permissive licence and multi-vendor governance, and is actively released (GL JS 6.13.0 and RN 11.5.0 shipped in October 2026). It is the part that will not cause trouble later. |
| Where is the Ola key? | Server-side only, in the existing `OLA_MAPS_API_KEY`. Browsers and the APK load tiles from `https://craves.in/api/location/map-tiles/...`, a same-origin proxy that adds the key. No new credential, no `NEXT_PUBLIC_*` variable, and no key in any bundle or APK. |
| Cost | Ola bills dynamic maps **per map load**: 100K loads per month free, then ₹0.141 per load up to 5M. One picker open is one style load. Tiles, glyphs and sprites are not separate loads. |
| What must a human do? | Merge the PR. Then run the release: regression → pipeline 14 `operation=web`. The mobile team builds the APK when they adopt the picker (see "APK" below). |

## Architecture

```
browser / APK (MapLibre)
   │  GET /api/location/map-tiles/{styles|data|fonts|glyphs|sprites}/...
   ▼
customer-web-next  src/app/api/location/map-tiles/[...path]/route.ts
   • same-site only: Sec-Fetch-Site: same-origin, or a Referer from this site (the APK sends Referer https://craves.in/)
   • path allow-list: Ola /tiles/vector/v1 resources only (no Places/Routing through this door), ≤ 8 segments, .json/.pbf/.mvt/.png/.webp
   • credential query params from the client are dropped
   • process-wide budgets: 60 style loads/min (4 in flight) and 6,000 other resources/min (64 in flight)
   ▼
src/lib/server/ola-maps.ts  fetchOlaMapsVectorResource()  → https://api.olamaps.io/tiles/vector/v1/... ?api_key=<server key>
   • style/TileJSON documents: every https://api.olamaps.io/tiles/vector/v1/ URL is rewritten to the proxy, any api_key is stripped,
     and the response fails closed (503) if the server key would still appear
   • tiles: content type checked; empty 204 tiles pass; Ola 404 stays 404, everything else becomes a generic 503
```

Caching: documents are sent `private, no-store`, because they carry the request's origin. Tiles, glyphs and sprites are `private, max-age=3600`: the browser cache only, never Front Door. Nothing is cached server-side, so Ola still counts every map load.

## Web (customer-web-next)

- `src/components/location/AddressMapPicker.tsx` is the interactive picker. Its props are unchanged, plus an optional `pinHint`. It loads `maplibre-gl` lazily, so only pages with a map download it.
- `src/components/location/StaticAddressMapPicker.tsx` is the previous static-image picker, kept as an automatic fallback. The picker falls back to it when WebGL is missing, the style does not load within 12 s, or the proxy fails.
- `src/app/vendor/maplibre-gl-worker.mjs/route.ts`: maplibre-gl 6 ships its web worker as a separate file that bundlers do not emit. This static route reads it from `node_modules` at build time and serves it same-origin, and the picker calls `setWorkerUrl`.
- The address editor keeps the map movable while the address resolves (the newest pin wins) and shows a "Delivering to" card with a skeleton and a "Change" action.
- Brand palette: red `#F62E18`, ink `#1A1A1A`, muted `#6B6B6B`, neutral `#F1F3F5`, border `#E5E7EB`.
- Ola and OpenStreetMap attribution is always visible, as the T&C require ("all Ola Marks and copyright notices are present").

Tests:
- `src/lib/map-tiles.vitest.ts` covers paths, query handling, document rewriting, the route's origin and budgets, and error mapping.
- `src/lib/ola-maps-transport.vitest.ts` covers vector transport: the key, rewriting, the fail-closed key echo, content types and 404.
- Locally, the picker was driven in Chromium against a production webpack build and a Turbopack dev server: a drag reports exactly one new point, zoom and locate report none, and the proxy failure falls back to the static map.

## APK (apps/mobile)

The user asked not to touch the mobile frontend, so **no existing screen changed**. What is ready:

- The `@maplibre/maplibre-react-native@11.5.0` dependency. Android uses MapLibre Native from Maven Central via autolinking. iOS gets it via SPM through the `$MLRN.post_install(installer)` hook added to `ios/Podfile`.
- `src/features/maps/OlaMapPicker.tsx` is a ready-made, brand-styled picker with the same behaviour as the web one: fixed pin, settle-then-report, "Locate me", loading and retry states, and attribution.
- `src/features/maps/olaMapTiles.ts` holds the proxy URL and the Referer header the proxy admits, which is limited to proxy URLs only. The URL defaults to `https://craves.in/api/location/map-tiles`. Set the optional, public `CRAVES_MAP_TILES_BASE_URL` in the app's `.env` only to use another environment's proxy.

To use it in the address editor:

```tsx
import {OlaMapPicker} from '../../maps/OlaMapPicker';

<OlaMapPicker
  latitude={draft.latitude}
  longitude={draft.longitude}
  pinHint="Your order will be delivered here"
  locating={locating}
  onUseCurrentLocation={useCurrentLocation}
  onCenterChange={point => reverseGeocode(point)} // existing /reverse-geocode API (429-aware)
/>
```

Then build the APK as usual: `cd apps/mobile && npm ci && cd android && ./gradlew assembleRelease` with the existing signing variables. For iOS, run `cd ios && pod install`.

## Release runbook

1. A human merges the PR to `main`. After the merge, the "Exact release launch regression" run on the new head must be green.
2. Run pipeline 14 with `operation=web`, `releaseSha=<new main head>` and `regressionRunId=<that run>`.
3. Verify on https://craves.in. Open Profile → Addresses → Add address → use a search result, and the map must show Ola streets with the red pin.
4. In DevTools → Network:
   - `/api/location/map-tiles/styles/default-light-standard/style.json` returns 200, and its body points only at `https://craves.in/api/location/map-tiles/...`;
   - no request contains `api_key`.
5. Rollback is automatic per user: any proxy or WebGL failure shows the static map. To roll back fully, redeploy the previous web image.

## Follow-ups (not blocking)

- **Budgets.** The proxy budgets are per replica, like the other location routes. If abuse appears, add per-IP limits (Front Door `X-Azure-ClientIP`) or short-lived signed map tokens from User/Chef for the APK.
- **Staging.** Staging environments that use `CRAVES_LOCATION_PROXY_BASE_URL` fall back to the static map unless they have their own `OLA_MAPS_API_KEY`.
- **Attribution.** If Ola's style itself carries attribution text, the strip may show it twice. Check after the first deploy and drop the custom line if so.
