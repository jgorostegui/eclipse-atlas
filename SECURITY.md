# Security policy

## Supported version

The default branch is the only supported version while the project is pre-1.0.

## Reporting a vulnerability

Do not open a public issue for a vulnerability that could expose users or an upstream
service. Send the maintainer a confidential report containing:

- affected revision and browser;
- reproduction steps or a minimal proof of concept;
- expected impact;
- whether an external service or credential is involved;
- any proposed mitigation.

The maintainer should acknowledge a complete report within seven days and publish a fix
or a scoped status update within 30 days.

## Current threat boundary

The application has no accounts, backend, database, secrets, or first-party write API.
It processes coordinates in the browser and fetches public raster tiles and a bundled JSON
catalog. External payloads are limited by status, MIME type, size, PNG signature, image
dimensions, schema validation, timeouts, and cancellation.

Coordinates entered by a user remain in page memory. Map and terrain providers can still
observe ordinary HTTP request metadata and requested tile coordinates; this must be
considered before treating a location as sensitive.
