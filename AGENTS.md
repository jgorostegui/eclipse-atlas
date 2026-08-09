# Eclipse Atlas agent guide

## What this is

Eclipse Atlas is a static planning map for the three solar eclipses visible from Spain:
the total eclipses of 12 August 2026 and 2 August 2027, and the annular eclipse of
26 January 2028. It brings eclipse geometry, the western terrain horizon, and atmospheric
context into one bilingual (English and Spanish) interface, and keeps each kind of
evidence separate instead of reducing it to a single number.

It is a Vite, React 19, and TypeScript single-page application. Everything runs in the
browser: there is no backend, database, account, or first-party write API. CI builds the
app and publishes it to GitHub Pages. It needs Node.js 22.13 or later and npm.

The hard part of the product is evidence handling, not astronomy alone. Saved places are
approximate planning references, never endorsed viewing venues or a best-location ranking.
A separate scientific verification harness holds the astronomy and terrain code to
independent thresholds; it currently validates the 2026 total eclipse and treats every
result as release-provisional until those thresholds pass.

## Operating rules (read first)

The constraints a change must not break. Each has a detailed section below.

- **Read before you change.** Read `README.md`, `SOURCES.md`, `CONTRIBUTING.md`, and
  `public/sources.json`; check `git status` and preserve unrelated work; read
  `CLAUDE.local.md` if it exists and treat it as local instructions you never commit.
  Before a scientific change, also read `verification/acceptance.json`, the frozen report,
  and the generator. Run `npm run check` before handing off.
- **Keep evidence classes separate.** Astronomy, terrain, weather, access, and operations
  have different error models and update cadences. Never merge them into an opaque score,
  and never present the place catalogue as a ranked or endorsed set of viewing sites.
- **Do not fake a release.** Never publish a recommendation while a release gate is
  incomplete or failing, and never relax, hide, or reframe a failing threshold to get a
  passing result. Gates are derived from raw evidence by the harness, not asserted by hand.
- **Stay static-first in the browser.** Do not add a server, Next.js, a secret-bearing
  API, or durable shared state without an explicit product requirement that cannot be met
  safely in the browser. Do not reconstruct retired prototypes or copy proprietary
  implementation details or datasets into the owned code.
- **Prefer explicit unknowns.** Use typed domain functions with explicit unknown and error
  states. Do not silently substitute a plausible value for missing evidence, turn an
  unavailable state into a negative result, or turn independent factors into a score.
- **Keep private material out of the repo.** Working analysis, audits, drafts, raw
  fixtures, and screenshots live under `__`-prefixed paths (gitignored). A real place with
  citable public provenance may ship as a marker; the conversation that produced a change
  may not.
- **Every interface change works on desktop and mobile.** Verify at a desktop width and at
  390 x 844, with no horizontal overflow and primary targets of at least 44 px. Change the
  English and Spanish catalogs together.

## Commands

Development:

```bash
npm ci
npm run dev          # Vite dev server on http://localhost:3000
npm run build        # tsc project build, then vite build into dist/
npm run preview      # serve the production build
```

Checks:

```bash
npm run check        # lint, audit, test, verification:check (the required gate)
npm run test:ui      # build, then Playwright/Chromium journeys with deterministic TerrainRGB fixtures
```

`npm run check` runs, in order: `lint` (eslint, zero warnings), `audit` (npm audit at
high), `test` (build, then `test:unit` Vitest and `test:repository` node:test boundary
checks), and `verification:check`. Run `test:ui` for any interface behaviour change; it is
separate because it installs and drives browsers.

Scientific verification:

```bash
npm run verification:check                       # validate the frozen report and derive release gates
npm run verification:check -- --require-release  # strict gate; non-zero is expected while evidence is blocked
npm run verification:fixtures                     # maintainer: fetch TerrainRGB/MDT05 fixtures (needs .env)
npm run verification:generate                     # maintainer: regenerate the report from IGN/CNIG inputs
```

Generators (maintainer operations that produce committed data or overlays from external
inputs): `places:generate`, `climate:generate`, `overlays:generate`,
`overlays:generate:events`.

## Architecture

A static SPA. `src/main.tsx` mounts one tree: `I18nProvider` wrapping `AppErrorBoundary`
wrapping `EclipsePlanner`. WebGL and Three.js are intentionally absent from the interface.
Paths below are relative to `src/`.

### The scientific core (`domain/`)

Pure, typed, framework-free calculation. The three effective entry points are `eclipse.ts`,
`terrain-horizon.ts`, and `weather.ts`; features import per file, there is no barrel.

- **`eclipse-events.ts`** is the data hub: the three events, their frozen NASA/GSFC
  Besselian elements, the per-event time scale (Delta T), and `eclipseEvent(id)`. Almost
  everything depends on it.
- **`astronomy.ts`** wraps the `astronomy-engine` package and installs the event-specific
  Delta T once at module load. Import astronomy through this file, never the package
  directly, or Delta T is not configured.
- **`besselian-eclipse.ts`** evaluates the Besselian elements into local circumstances
  (contacts, magnitude, obscuration, totality duration). **`eclipse.ts`** is the geometry
  engine on top: circumstances, Sun and Moon animation tracks, and
  `isSolarCentreAboveApparentHorizon`.
- **`observer.ts`** resolves observer elevation as ground elevation plus a 1.5 m viewpoint
  height, range-checked. **`terrain-coverage.ts`** holds the supported lat/lon envelopes
  (Iberia, Canaries, Melilla) and the display time zone.
- **`terrain-horizon.ts`** fetches IGN/CNIG TerrainRGB tiles (zoom 11, 512 px), decodes
  elevation with the Mapbox formula `-10000 + (r*65536 + g*256 + b) * 0.1`, rejects
  transparent, no-data, and out-of-range pixels, ray-marches the terrain into a
  horizon-altitude profile, and assesses solar-disc obstruction.
- **`weather.ts`** is the Open-Meteo forecast client, every response Zod-validated.

### The interface (`features/`)

`planner/EclipsePlanner.tsx` is the composition root and owns nearly all state (URL state,
selection and comparison, observer elevations, terrain results, climate and forecast). It
assembles the header, the `PlannerRail`, the map, the timeline, and the evidence tabs.

- **`map/`** wraps Leaflet, dynamically imported inside `EclipseMap.tsx`. The planner
  connects to it through `onSelect` (marker click) and `onPick` (map click) callbacks; pure
  helpers cover marker grouping, the umbra layer, and the cloud-cover palette.
- **`horizon/`** renders the terrain profile and the eclipse animation with a
  model-then-paint split: `horizon-canvas-renderer.ts` builds a serializable scene, then
  paints it to a 2D canvas, which keeps the geometry testable.
- Smaller areas: **`eclipse/`** (contact timeline), **`eclipse-events/`** (event switcher),
  **`weather/`**, **`shell/`** (header, help, mobile nav), **`errors/`** (boundary).
  `safety/` and `sources/` are empty placeholders.

### State, data, and localization (`data/`, `app/`, `i18n/`)

- **`data/candidates.ts`** merges four point sources into the unified `CandidateLocation`
  type. `public-place-catalog.json` is generated by the places script;
  `national-planning-points.json`, `official-observation-points.json`, and
  `candidate-reference-points.json` are hand-authored. **`data/source-catalog.ts`** is a
  Zod schema that validates `public/sources.json`; it is test-only and not imported at
  runtime.
- **`app/planner-url-state.ts`** serializes shareable state into query params: event,
  selected location, up to three comparison locations, map layer, and locale, each
  validated with typed issue codes.
- **`i18n/`** is a flat catalog with no external library. `messages.ts` holds
  `englishMessages` (the source of truth) and `spanishMessages`, which must cover every
  key. `I18nProvider.tsx` resolves the locale and exposes `t` and formatters;
  `localize-candidate.ts` bridges locale-free data to translated labels.

### The scientific verification harness

The frozen report `verification/scientific-verification.json`, its `.sha256` checksum, and
the thresholds in `verification/acceptance.json` are checked into the repo;
`scripts/scientific-verification.mjs` is the checker (part of `npm run check`). It does not
trust the report's own conclusions:

- It rebinds the report to the current code by SHA-256 over the domain and horizon files,
  `acceptance.json`, `public/sources.json`, and the generator, plus a dependency digest over
  the `astronomy-engine`, `geotiff`, and `pngjs` closures. Any drift fails the check, so
  scientific code cannot change without regenerating the report, while unrelated dev-tooling
  patches leave it valid.
- The stored report must carry only raw evidence. The checker recomputes every residual and
  summary from the raw product-versus-reference values and re-derives the release gates;
  derived fields left in the stored report are rejected.
- The human-evidence release gates (field horizon, independent review, exact venues, current
  weather, operations freshness, documented clearances, and a second independent astronomy
  source) are fail-closed until per-category validators exist, so
  `verification:check -- --require-release` is expected to exit non-zero today. A plain
  `npm run check` still passes: the report is valid even though a recommendation is not yet
  permitted.

Regenerating the report is a maintainer operation from large IGN/CNIG inputs referenced in
`.env.example`; the generator verifies each input against a frozen SHA-256 and fails closed
on a mismatch. See `CONTRIBUTING.md`.

Rules the harness and reviewers enforce:

- Resolve observer ground elevation from IGN/CNIG TerrainRGB. Never restore a silent 0 m
  fallback.
- Reject transparent, no-data, corrupt, or out-of-range terrain samples before astronomy or
  horizon math consumes them.
- Preserve each contact's time and apparent, refraction-adjusted solar-centre altitude. A
  centre at or below the apparent horizon is not directly observable, and a positive value
  does not by itself establish terrain clearance at that contact.
- Treat TerrainRGB-to-MDT05 comparisons as same-lineage consistency checks, not independent
  DEM accuracy evidence. Keep Earth-curvature and refraction assumptions explicit and tested.

## Data and provenance

- Every public source is documented in `public/sources.json` with producer, URL, retrieval
  date or version, role, licence, transformation, attribution, and limitations. `SOURCES.md`
  is the human-readable contract and defines the three evidence classes: calculated,
  referenced, and linked-only.
- Do not copy structured content without confirmed reuse rights. Link to an uncertain
  operational source instead of redistributing it.
- Preserve visible OpenStreetMap and IGN/CNIG attribution.
- Never commit research notes, raw fixtures, third-party reference material, or local plans.
  A product place marker with real public provenance is fine; a marker must never become a
  scientific fixture, an acceptance criterion, or a verification threshold.

## Solar-viewing safety

Keep one curated public safety reference in the source catalogue or documentation (currently
the AAS eye-safety guidance). Do not place a safety banner or safety copy in the primary map
workflow.

## Interface conventions

- Owned code, filenames, tests, and documentation are English. UI strings live in the typed
  English and Spanish catalogs; add or change both locales together instead of scattering
  translated literals through components.
- Make units explicit, especially on compact map markers and scientific metrics, and avoid
  labels that could be mistaken for a score. Prefer copy that states what is known, unknown,
  or required over promotional or motivational language.
- Preserve keyboard navigation, visible focus, WCAG AA text contrast, readable map
  attribution, and mobile primary targets of at least 44 px. Every interface change must work
  at a desktop width and at 390 x 844 with no horizontal overflow. A change that only works on
  one form factor is not done.

## Change discipline

- Keep changes scoped to the request. Avoid unrelated dependency or architecture churn.
- Add regression coverage for scientific calculations, failure behaviour, translations, and
  release-gate logic.
- Update public documentation and provenance whenever a claim, source, assumption, or
  limitation changes.
- Report remaining blockers plainly. Passing software tests is not scientific or operational
  release approval.
- Do not commit, push, deploy, or publish unless the user explicitly asks.
