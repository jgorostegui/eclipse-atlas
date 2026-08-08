# Eclipse Atlas agent guide

## Product mission

- Maintain an evidence-led planning tool for the 12 August 2026 solar eclipse across supported Spanish territory.
- Keep saved locations as approximate planning references, never as endorsed viewing venues or a best-location ranking.
- Keep astronomy, terrain, weather, access, and operations as separate evidence classes. Do not collapse them into an opaque score.
- Do not publish a recommendation while scientific, field, weather, venue, or operational release gates are incomplete or failing.

## Read before changing the project

- Read `README.md`, `SOURCES.md`, `CONTRIBUTING.md`, and `public/sources.json` before substantial work.
- If `CLAUDE.local.md` exists at the repository root, read it before substantial work and treat it as additional local instructions. Never commit that file.
- For scientific changes, also inspect `verification/acceptance.json`, the stable report,
  and the relevant generator code.
- Inspect `git status` before editing. Preserve user-owned and unrelated changes.
- Run `npm run check` before handing off an implementation change.

## Architecture boundaries

- The product is a static Vite, React, and TypeScript single-page application.
- Keep calculations in the browser unless a concrete server-side requirement justifies a backend.
- Do not introduce Next.js, an application server, secret-bearing APIs, or durable shared state without an explicit product requirement.
- Do not reconstruct retired prototypes or copy proprietary implementation details or datasets into the owned application.
- Prefer typed domain functions and explicit unknown/error states. Do not silently substitute plausible values for missing evidence.

## Scientific integrity

- Treat Astronomy Engine output as modelled and release-provisional until independent thresholds pass.
- Resolve observer ground elevation from IGN/CNIG TerrainRGB. Never restore a silent 0 m fallback.
- Preserve each eclipse contact's time and apparent, refraction-adjusted solar-centre altitude. A centre at or below the apparent horizon must be labelled not directly observable; a positive value does not establish terrain clearance at that contact.
- Reject transparent, no-data, corrupt, or out-of-range terrain samples before astronomy or horizon calculations consume them.
- Treat TerrainRGB-to-MDT05 comparisons as same-lineage consistency checks, not independent DEM accuracy evidence.
- Keep Earth-curvature and refraction assumptions explicit and covered by tests.
- Never relax, hide, or reframe a failing validation threshold to obtain a passing release result.
- Keep the stable machine-readable verification report and its checksum coherent; derive release gates when checking it.

## Solar-viewing safety

- Keep one curated public safety reference in the source catalog or supporting documentation.
- Do not place a safety banner or safety copy in the primary map workflow.

## Data and provenance

- Every public data source must identify producer, URL, retrieval date or version, role, licence, transformation, attribution, and limitations in `public/sources.json`.
- Do not redistribute structured content without confirmed reuse rights. Link to uncertain operational sources instead.
- Preserve visible OpenStreetMap and IGN/CNIG attribution.
- Never commit research notes, raw fixtures, third-party reference material or local
  implementation plans.

## Product and interface conventions

- Keep owned code, filenames, tests, and documentation in English.
- Maintain typed English and Spanish UI catalogs. Add or change both locales together; do not scatter translated literals through components.
- Make units explicit, especially on compact map markers and scientific metrics. Avoid labels that could be mistaken for scores.
- Prefer operational copy that explains what is known, unknown, or required over promotional or motivational slogans.
- Preserve keyboard navigation, visible focus, WCAG AA text contrast, readable map attribution, and mobile primary targets of at least 44 px.
- Every interface change MUST work on both desktop and mobile. Verify each one at a desktop width and at a 390 x 844 mobile viewport, with no horizontal overflow and primary targets of at least 44 px on mobile. A feature that only works on one form factor is not done.

## Verification commands

- `npm run check`: required lint, build, unit, repository, source-catalog, and artifact checks.
- `npm run test:ui`: functional Chromium tests against the production build with deterministic TerrainRGB fixtures; required for interface behaviour changes.
- `npm run verification:check`: validates the stable scientific report checksum and derives release gates from raw evidence.
- `npm run verification:generate`: regenerates scientific evidence from externally stored
  IGN/CNIG fixtures configured through environment variables.
- `npm run verification:check -- --require-release`: strict gate; a non-zero result is expected while required evidence remains blocked.
- Do not commit, push, deploy, or publish unless the user explicitly requests it.

## Change discipline

- Keep changes scoped to the request and avoid unrelated dependency or architecture churn.
- Add regression coverage for scientific calculations, failure behaviour, translations, and release-gate logic.
- Update public documentation and provenance whenever product claims, sources, assumptions, or limitations change.
- Report remaining blockers plainly. Passing software tests alone is not scientific or operational release approval.
