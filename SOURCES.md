# Sources and methodology

This document is the public provenance contract for Eclipse Atlas. The runtime
catalog is [public/sources.json](public/sources.json) and is linked from the interface.

## Publication policy

Every published value must identify its producer, retrieval date or version, license,
transformation, precision, and limitations. Network accessibility is not evidence of a
right to redistribute data. A source without confirmed reuse terms may be linked for
human verification, but its structured content is not copied into this repository.

The product therefore separates three evidence classes:

1. **Calculated:** deterministic output produced locally from a documented engine or
   licensed source.
2. **Referenced:** a coordinate or label copied under explicit reuse terms with its
   original precision preserved.
3. **Linked only:** operational information that remains on the publisher's website and
   must be rechecked by the user.

No composite suitability score is published. Geometry, terrain, weather, access, and
operations have different error models and update cadences; collapsing them into one
number would conceal those differences.

## Runtime sources

### Eclipse geometry

- **Local circumstances:** an owned implementation evaluates the published NASA/GSFC
  Besselian elements for [2026](https://eclipse.gsfc.nasa.gov/SEsearch/SEdata.php?Ecl=20260812),
  [2027](https://eclipse.gsfc.nasa.gov/SEsearch/SEdata.php?Ecl=20270802) and
  [2028](https://eclipse.gsfc.nasa.gov/SEsearch/SEdata.php?Ecl=20280126) to calculate
  eclipse type, C1 to C4 contacts, maximum, obscuration and central-phase duration.
  Required acknowledgement: “Eclipse Predictions by Fred Espenak, NASA's GSFC.”
- **Event time scale:** [IERS Bulletin A XXXIX-031](https://datacenter.iers.org/data/6/bulletina-xxxix-031.txt),
  issued 30 July 2026 and frozen by SHA-256 in the source catalog. At MJD 61264,
  TAI−UTC is 37 s, TT−TAI is 32.184 s and predicted UT1−UTC is +0.01091 s;
  therefore TT−UTC is 69.184 s and Delta T is 69.17309 s.
  This event-specific value applies to 2026. The 2027 and 2028 calculations use the
  long-range Delta T values of 76.0 s and 76.3 s published with the corresponding
  NASA/GSFC element tables.
- **Apparent positions:** [Astronomy Engine](https://github.com/cosinekitty/astronomy),
  version pinned in `package-lock.json`, supplies topocentric apparent Sun, Moon and
  optional planet positions, plus solar and lunar angular radii. Its Delta T hook uses
  the same event-specific value.
- **Optional bright-star context:** eight named bright-star ICRS/J2000 positions and
  parallaxes are retained from SIMBAD/CDS under ODbL with attribution. Astronomy Engine
  precesses those fixed positions and converts them to the selected observer's apparent
  horizontal coordinates. The chart labels calculated positions only; it does not claim
  that a planet or star will be visible during totality. Proper motion is not propagated,
  and the curated set is not a complete sky catalogue.
- **Inputs:** WGS 84 latitude and longitude plus observer ground elevation decoded from
  the IGN/CNIG TerrainRGB tile at the selected coordinate and an explicit 1.5 metre
  planning viewpoint height.
- **Outputs:** event type, contact times, eclipse magnitude, maximum obscuration,
  totality or annularity duration, topocentric solar altitude and azimuth, and apparent upper-limb
  sunset against the ideal horizon. The Besselian roots use the current IERS time
  scale rather than the source page's older 75.4 s Delta T assumption. Every contact
  retains the apparent,
  refraction-adjusted altitude of the solar centre relative to the ideal horizontal
  plane. A centre at or below that apparent horizon is labelled as not directly
  observable; positive altitude does not establish clearance from terrain, buildings,
  or vegetation at that contact.
- **Failure behaviour:** astronomical output remains unknown if observer elevation cannot
  be resolved. A 0 metre fallback is not published.
- **2028 end contact:** the partial phase leaves western Spain about eight minutes after
  the six-hour coefficient-fit interval stated on the NASA table. The implementation
  continues the same published polynomials for 15 minutes to retain C4, and regression
  checks compare the resulting Spanish end times with the IGN published 19:08 CET end.

### Terrain horizon

- **Producer:** Instituto Geográfico Nacional / Centro Nacional de Información
  Geográfica (IGN/CNIG).
- **Service:** the official TerrainRGB XYZ endpoint documented in
  [public/sources.json](public/sources.json).
- **Decode:** `elevation = -10000 + (R × 256² + G × 256 + B) × 0.1` metres.
- **Method:** start with 61 rays across 30 degrees around the solar azimuth and expand
  that range in 0.5 degree steps when needed to cover the C1-to-C4 solar track, the
  spherical horizontal width of the disc, and one degree of interpolation padding.
  Every ray reaches 100 km using a distance-adaptive schedule from 0.05 to 1 km. A
  separate local solar-disc sweep has no azimuth gap wider than 0.05 degrees. The
  observer is the decoded ground elevation plus an explicit 1.5 metre planning
  viewpoint height. The model computes the maximum apparent terrain angle and applies
  Earth curvature with a documented refraction coefficient of 0.13.
- **Product coverage:** three configured request envelopes are intended to cover the
  peninsula, Balearic Islands, Ceuta, Canary Islands, and Melilla. They are not Spain's
  political boundary, include neighbouring territory and sea, and only authorize a
  request; the service still determines whether an individual pixel contains elevation
  data.
- **Known gap:** terrain data cannot reliably represent vegetation, temporary structures,
  every building, or a nearby obstruction between samples. A site photograph or survey
  remains mandatory. Step 6 terrain residuals cover five mainland validation points,
  including a frozen 209.64-metre Los Quebrantos–Punta d'El Pozacu coastal pair, and
  must not be generalized into a Spain-wide accuracy claim.
- **Lineage caveat:** the TerrainRGB and MDT05 products share IGN/CNIG elevation lineage.
  Their comparison checks decoder, addressing, resampling, and horizon-algorithm
  consistency; it is not an independent DEM accuracy measurement.

### Atmospheric context

Climate and forecast are deliberately separate products. Neither changes eclipse
geometry, terrain clearance, comparison ordering, or a release gate.

- **August climatology:** a versioned public artifact summarizes ERA5 total cloud cover
  at 18:00 UTC for every August day from 1991 through 2020: 930 samples at each of the
  41 national reference points. The displayed mean and interquartile range describe the
  nearest 0.25-degree ERA5 grid cell. They are not a forecast, a success probability, or
  a continuous national raster.
- **Reproducibility:** `npm run climate:generate` validates 30 locally retained annual
  Open-Meteo Historical Weather API responses, rejects missing and out-of-range values,
  and regenerates the compact artifact and checksum. The artifact records the raw-input
  aggregate SHA-256, source DOI, grid coordinates, parameters, sample counts, and
  transformation limitations.
- **Event-day model comparison:** the selected-location panel requests deterministic
  total cloud cover from four independent model producers through their dedicated
  Open-Meteo endpoints: ECMWF IFS HRES, NOAA GFS, DWD ICON and ECCC GEM. Every row shows
  the four returned hours from 17:00 through 20:00 UTC in the location's civil time. The
  model hour nearest the eclipse maximum is marked, but the application does not
  interpolate a value at the exact maximum and does not combine rows into a probability
  or score. A row can be loading, available, outside its forecast horizon, or failed.
- **ECMWF supporting detail:** ECMWF remains the only national forecast map and the only
  row with supporting cloud layers, preceding-hour precipitation, 10 metre wind and
  preceding-three-hour maximum gust. The browser batches ECMWF for selected, compared,
  or nationally displayed references. GFS, ICON and GEM are fetched only for the selected
  location, so their independent failures do not remove the other rows.
- **Validation:** each weather response is checked for status, JSON MIME type, body size,
  units, coordinates, time alignment, ordered arrays and defensive physical ranges under
  an eight-second request deadline. ECMWF batch identity is also validated. Null,
  malformed, duplicated, incomplete or misidentified values stay unknown.
- **Temporal and spatial processing:** IFS HRES native output becomes 3-hourly after 90
  forecast hours and 6-hourly after 144 hours. Open-Meteo dynamically interpolates that
  output to the hourly API series and applies its documented land-cell selection and
  90 metre elevation downscaling. The application selects returned hours without adding
  another interpolation and retains the service coordinate and downscaling elevation.
  GFS becomes 3-hourly after 120 hours, ICON after 78 hours, and GEM Global is 3-hourly.
  Open-Meteo can therefore interpolate those model series to the displayed hourly values.
- **Run identity:** the browser first requests the identified ECMWF single run. If that
  run does not contain the eclipse hours or the exact-run request is unavailable, times
  out or fails in transport, it tries the rolling ECMWF endpoint. The result is labelled
  as rolling delivery while showing the latest run metadata; those metadata are never
  presented as proof that every returned field came from that exact run. Caller
  cancellation does not start a fallback request.
- **Attribution and service terms:** the source catalog identifies each model producer
  and its Open-Meteo delivery endpoint. The Open-Meteo free endpoint is non-commercial and
  rate-limited. A production operator must recheck the current licence, terms, quotas and
  availability assumptions.
- **Official cross-check:** for the 2026 event the selected-location panel also shows
  the AEMET official municipal forecast for eclipse day, read live in the browser from
  the national JSON document the IGN republishes for its eclipse visualizer. The
  coordinate is resolved to a municipality through the IGN/CNIG CartoCiudad reverse
  geocoder, falling back to an unambiguous catalogued municipality name for remote
  saved places, and the value is labelled as one figure for the whole municipal
  territory with the AEMET source and forecast date visible. It is displayed beside
  the model rows, never merged with them, and every resolution or transport failure
  surfaces as an explicit unavailable state. Saved points with a known municipality
  additionally open the AEMET municipality search with that name already entered; no
  AEMET OpenData key is used or exposed.
- **Release boundary:** runtime weather is intentionally absent from the stable
  scientific report. Publication of a recommendation still requires an archived named
  model and run, units, retrieval time, uncertainty, interface capture and operational
  review near the event.

### Official national eclipse overview

- **Producer:** Instituto Geográfico Nacional / Observatorio Astronómico Nacional.
- **Sources:** frozen IGN/CNIG GeoTIFF and GeoPackage products for all three events,
  each identified by byte size and SHA-256 in [public/sources.json](public/sources.json).
  The downloaded source containers are not redistributed.
- **Published quantities:** apparent, refraction-adjusted solar-centre altitude at
  maximum, maximum obscuration, totality or annularity duration ranges, and discrete
  umbra or antumbra footprints sampled every 3.6 seconds. The 2026 animation has 277
  frames, 2027 has 724, and 2028 has 353. No terrain-shadow, weather, quality, or
  recommendation layer is derived.
- **Raster transformation:** crop 2094 × 1928 source-aligned COG cells without
  reprojection or interpolation, mask no-data and maximum-after-sunset cells, and render
  lossless altitude and obscuration PNGs with quantity-specific palettes. Altitudes below
  0 degrees and obscuration below the displayed 80 percent domain are transparent visual
  cutoffs, not reclassified values. Small band-3 floating-point excursions within
  0.00002 of [0, 1] are clamped only for colour selection; raw audit statistics are
  preserved and larger excursions abort.
- **Vector transformation:** validate the GeoPackage checksum, EPSG:4326 CRS, layer
  schemas, 13 duration bands, 277 timestamps, and 3.6 second cadence. Duration polygons
  are filled at output pixel centres in EPSG:3857 and masked by the rasterized union of
  all 277 same-package umbra footprints. This retains the official 0–10 second edge band
  while making cells outside the totality envelope transparent. Umbra rings retain the
  upstream 0.0001-degree simplification and receive an additional 1/120-degree
  Douglas–Peucker simplification only when the relative ring-area error remains at or
  below 1 percent; coordinates are rounded to six decimals. Upstream IDs, layer names,
  time-flag columns, and absolute producer paths are removed. Polygon geometry is never
  interpolated.
- **Use:** optional regional visual context at approximately 1.223 km per cell. Colours
  and ranges are not decoded as clicked point values. An umbra footprint means totality
  occurs within that footprint at the sampled instant; it is not a cloud, ambient-light,
  or terrain-shadow simulation. Point astronomy and the TerrainRGB horizon remain
  separate calculations.
- **Lineage caveat:** the stable scientific verification report remains scoped to 2026.
  The 2027 and 2028 layers are source-bound product inputs and visual cross-checks, not
  a claim that the 2026 verification thresholds have been rerun for those events.

### Public planning context

The application links to the
[IGN/OAN practical recommendations](https://eclipses.ign.es/recomendaciones-practicas.html)
as its primary theory and observation-planning context. The
[Trío de Eclipses public platform](https://www.trioeclipses.es/) is linked as official
event information. No API responses, curated points, tiles, rankings, scores, source
code or structured outputs are copied from that platform. It is not a numerical
validation fixture and does not change a release gate.

### Eye safety

The source catalog retains one linked-only American Astronomical Society reference. The
primary map workflow does not reproduce safety guidance or render a safety banner.

### Map-place coordinates

The generated public place catalogue contains 1,001 independently sourced references. It
selects all 562 GeoNames Spain populated-place records with a published population of at
least 20,000, 346 named OpenStreetMap viewpoints inside the OSM Spain boundary, and 93
named OpenStreetMap objects identified as astronomical observatories or planetariums.
Several objects can describe one facility. The population cut is only a transparent
way to make city discovery finite. It is not a claim about municipal importance or eclipse
suitability. Every row retains its GeoNames or OpenStreetMap feature identifier and source
URL.

The OpenStreetMap input was captured independently from a rectangular request envelope.
The generator then applies the detailed OSM Spain boundary so that Portuguese and French
features in that envelope are rejected. Weather, geophysical, atmospheric, forestry and
wildlife observatories are excluded from the astronomy class. A named viewpoint or
astronomy facility is still only a mapped geographic reference. Its orientation, public
opening, solar-observation policy, terrain clearance and local access remain unknown until
checked separately.

The earlier national layer remains as a 41-point evidence subset: 23 cities that the
[IGN/OAN eclipse overview](https://eclipses.ign.es/eclipse-total-sol-de-12-de-agosto-2026.html)
identifies as crossed by totality, eight OpenStreetMap viewpoint candidates with coarse
western-sector direction metadata, and ten major partial-eclipse context cities. These 41
references, and only these references, have checksum-bound ERA5 climate summaries. The
larger city, viewpoint and astronomy catalogue does not silently inherit weather from a
nearby point.

The map groups the expanded catalogue at national and regional zooms, limits detailed
markers to the current viewport, and keeps every reference searchable by name. This is a
display and performance policy, not a ranking. No eclipse score, terrain verdict or
popularity order is stored in the catalogue.

`npm run places:generate` rebuilds the owned JSON artifact from externally retained
GeoNames, Overpass and OSM boundary inputs configured through the environment variables
named by the generator. The exact acquisition request text and rectangular envelope were
not retained with this first OSM snapshot, so the hashes bind the inputs but do not by
themselves reproduce their acquisition; a versioned request is required for the next
refresh. The generator validates source shape, political-boundary membership, minimum
counts, unique identifiers and coordinate ranges, and records every raw-input checksum in
the artifact.

The official-programme class remains separate. It contains all 75 rows from the Junta de
Castilla y León spreadsheet, four independently mapped references with individual
Government of Navarra operational links, and four Government of Aragón programme
references. The Castilla y León checksum, public-sector reuse conditions and three
duplicate-label anomalies are recorded in [public/sources.json](public/sources.json).
The complete Navarra network is linked as an external directory because no open licence
for redistributing its structured catalogue has been confirmed.

These markers are approximate planning references, not endorsed venues. Earlier local
OpenStreetMap references remain searchable and URL-compatible but do not shape the national
view. A map click or coordinate form creates a user point without transmitting it
to this project. Its normalized coordinates can be retained in a versioned share URL with
the selected comparison; no first-party server or durable shared store receives them.

The scientific fixture additionally retains the single six-decimal coordinate published
by Turismo Asturias for Playa de Los Quebrantos. It is used only to test nearby coastal
horizon behaviour against Punta d'El Pozacu; it is not added as an endorsed venue or a
ranked map point.

### Place-name search

The search box also queries the IGN/CNIG CartoCiudad geocoder live in the browser, so a
small settlement or nomenclátor toponym that does not meet the catalogue's population cut
can still be found by name. Results appear in their own list section with visible IGN
attribution, separate from the curated catalogue, and are never merged into it or ranked.
Street, address and retail layers are excluded from the request. Selecting a result
retrieves only the entity's WGS 84 coordinate and creates the same unverified user point
as a pasted coordinate, subject to the same supported-terrain envelope check. A failing or
empty answer surfaces as an explicit unavailable or no-match state, and a position the
service cannot resolve stays unknown instead of becoming a fabricated location. No
response geometry or other content is stored or redistributed.

### Operational information

Government of Navarra and Government of Aragón pages are linked only for operations. The
Navarra directory remains external; four independently mapped references retain individual
outbound pages without republishing the complete network, ticket price, availability,
capacity, services, parking or operational map payloads. The application also exposes fourteen regional
public-authority directories as outbound links rather than copying structured catalogues
whose reuse rights are unconfirmed. Users must verify the linked organizer immediately
before travel or purchase.

### Basemap

Map data and the evaluation tile layer are supplied by OpenStreetMap contributors with
visible attribution. The community raster tile service has no service-level agreement and
is governed by the OpenStreetMap Foundation tile usage policy. Material production traffic
requires a suitable provider or a self-hosted regional archive.

Two optional IGN/CNIG base maps can be selected in the map view picker: the national
topographic raster (MTN, via WMTS) and the PNOA maximum-currency aerial orthophoto (via
TMS). Both are
displayed without modification under the CC BY 4.0-compatible IGN/CNIG data policy with
visible IGN attribution while active. They cover Spanish national territory only, so the
OpenStreetMap underlay always remains beneath them. A base map choice changes visual
context only and never changes a calculated eclipse, terrain, or weather value.

### Clock calibration

The live eclipse mode counts down to the modelled contact times of the selected place.
Those instants come from the local calculation; the network is used only to check the
device clock. On entry the application sends a few HEAD requests to its own deployment
origin and reads the CDN timing header (Fastly `X-Timer`, a Unix timestamp with
microsecond resolution stamped when the request reaches the edge). The lowest-latency
samples estimate the device-clock offset, which is displayed with its estimated
uncertainty and age instead of being applied silently. The synchronized state requires
at least three kept samples; a thinner calibration is presented as partial and is not
persisted, while a redundant one is kept in the browser's local storage so a later
offline session can reuse it at reduced confidence. Each probe times out after a few
seconds, the calibration renews periodically while the mode stays open, and a resume or
device-clock change degrades the state until a fresh calibration confirms the offset.
No response body is read and no third-party time service is contacted. Without a usable
response the mode says so and runs on the uncorrected device clock. The correction never
changes a calculated contact time, only the clock the countdown is read against, and the
displayed precision of the countdown does not imply that the modelled contact instants
themselves are known to that precision.

The full URLs, licenses, attribution strings, transformations, versions, and limitations
are machine-readable in [public/sources.json](public/sources.json).

## Release verification

Passing software tests is necessary but not sufficient. A public recommendation requires
the following evidence package.

| Area | Independent reference | Acceptance criterion | Required artifact |
| --- | --- | --- | --- |
| Event classification | IGN/CNIG 2026 eclipse product | Same total/partial classification at every reference point | Machine-readable comparison table |
| Contact times | IGN/CNIG and one independent astronomical source | Absolute error at each contact no greater than 2 seconds | Machine-readable test fixture and report |
| Solar position | Independent ephemeris implementation | Altitude and azimuth error no greater than 0.05 degrees | Reproducible calculation report |
| Maximum obscuration | IGN/CNIG 2026 eclipse product | Absolute fraction error no greater than 0.001 (0.1 percentage point, matching the displayed precision) | Point-by-point residuals |
| Totality duration | IGN/CNIG reference locations | Absolute error no greater than 2 seconds | Point-by-point residuals |
| Terrain elevation | IGN/CNIG source samples | Decode and tile addressing exact on published fixtures | Unit fixtures with source coordinates |
| Horizon angle | Surveyed or photograph-derived landmarks at representative sites | Angular error no greater than 0.25 degrees | Annotated imagery and residual table |
| Obstruction clearance | Field visit at each recommended exact point | Solar limb clears terrain and local obstacles with documented margin | Geotagged, timestamped panorama |
| Weather | Named forecast model and run | Model, run time, units, update time, and uncertainty visible | Archived response and UI capture |
| Operations | Organizer or land manager | Access, opening, booking, parking, and safety rechecked within 72 hours | Dated source links and reviewer sign-off |

Validation points must cover the centre line, both path edges, low and high elevations,
flat and mountainous western horizons, and at least one location outside totality. Input
coordinates, observer elevation, time standard, refraction model, dependency versions,
and source checksums must be recorded so another engineer can reproduce every residual.

Any failed criterion blocks a recommendation. The interface may still expose raw,
qualified evidence, but it must not convert an unvalidated result into advice.

The repository keeps one stable raw-evidence report and derives release gates at check
time. The
TerrainRGB-to-MDT05 comparison is a same-lineage consistency check, not an independent
terrain reference or a release decision.

## Change control

A source update requires:

1. a reviewed change to `public/sources.json`;
2. a version or retrieval-date update;
3. repeatable transformation code rather than a manual spreadsheet edit;
4. regression fixtures for affected calculations;
5. rerunning the release-verification matrix when scientific output can change.

Generated datasets, when introduced, must additionally record input and output SHA-256
checksums, tool revision, parameters, geographic coverage, resolution, and creation time.
