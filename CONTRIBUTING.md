# Contributing

## Engineering contract

Changes must preserve three boundaries:

- **Evidence:** no value is published without provenance, precision, transformation,
  and limitations.
- **Architecture:** the browser remains static-first; introduce a server only for a
  documented capability that cannot be delivered safely from the browser.
- **Product language:** source, UI, tests, and owned documentation are English. Legal
  names and immutable upstream artifacts retain their source language.

Do not add scraped or reverse-engineered structured data unless the producer has granted
redistribution rights. Never convert an unknown into a zero, an unavailable state into a
negative result, or independent factors into an unexplained score.

## Workflow

1. Create a focused branch.
2. Add or update tests before changing a scientific or data boundary.
3. Update `public/sources.json` and `SOURCES.md` when provenance changes.
4. Run `npm run check`.
5. Run `npm run test:ui` for functional or interface changes.
6. Verify the production build in a browser at desktop and mobile widths.
7. Describe assumptions, residual risk, and verification evidence in the pull request.

## Definition of done

- Strict TypeScript, lint, unit, interaction, build, boundary, and served-artifact checks
  pass.
- Browser-level user journeys pass with deterministic fixtures at desktop and mobile
  viewports when interface behaviour changes.
- Automated WCAG A and AA checks, keyboard navigation, target sizes, reduced motion,
  and layout geometry pass for interface changes.
- Loading, empty, error, and aborted states are intentional and accessible.
- User input is validated at the boundary.
- External responses are bounded, validated, cancellable, and never trusted by shape.
- New public data has a machine-readable source record and a confirmed license.
- Scientific output has an independent fixture or is visibly marked unvalidated.
- No ignored local material or generated build output is committed.

Commits should be small enough to review and use imperative English subject lines.
