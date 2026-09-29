# Data Sources

## PIN-code boundaries

- Dataset: All India PIN Code Boundary GeoJSON
- Publisher/source authority: Ministry of Communications, Department of Posts, surfaced through the Open Government Data Platform India
- Delivery layer used by this prototype: Esri India Living Atlas `Pincode_Boundary_2025` feature service
- Service URL: https://livingatlas.esri.in/server1/rest/services/India/Pincode_Boundary_2025/MapServer/0
- Gap-filling layer: Esri India Living Atlas `IN_Postal_Code_Boundaries_2024`, https://livingatlas.esri.in/server/rest/services/IAB2024/IN_Postal_Code_Boundaries_2024/MapServer/0
- OGD catalog URL: https://www.data.gov.in/catalog/all-india-pincode-boundary-geo-json
- License: Government Open Data License - India
- Retrieved: 2026-09-12
- Coordinate system in the checked-in extract: WGS 84 longitude/latitude (`EPSG:4326`)

The checked-in `public/pincode-boundaries.geojson` contains the nine unique PINs in the original sample. The app queries the 2025 service for other PINs, then the 2024 service only for missing PINs. For a dealer without a full address, an interior point of the matching PIN polygon supplies an approximate marker; independent latitude/longitude medians from postal-directory rows are not used. Before a new or changed dealer location is saved, the server checks that its PIN/state exists in the postal directory, that the polygon agrees on state, and that the point is inside that polygon. Missing or conflicting polygons require review rather than a guessed point. `npm run db:audit-dealer-locations` runs the same geographic checks against all stored dealers and writes `outputs/dealer-location-audit.json` without changing the database.

The 2024 layer fills three PIN gaps found in the 2025 layer: 500025, 500095, and 523156. For 507111, both Esri vintages include a polygon but label its `state` Andhra Pradesh, while the 2025 `circle` and 2024 `circle_name` identify Telangana. The current postal directory, an [India Post listing](https://www.indiapost.gov.in/VAS/Pages/News/RevListofPOs.pdf), and the independent Telangana outline agree that Bhadrachalam is in Telangana. The app narrowly normalizes this one polygon's state label while retaining `original_state` for provenance. This does not alter the underlying PIN geometry or silently rewrite dealer states.

These polygons are the current territory unit, not a permanent business rule. Sales leadership should review whether postal boundaries match real salesperson ownership before production use.

The map preserves primary results before a fallback query and attempts the fallback during primary failures. Successfully loaded public polygons are stored in versioned browser IndexedDB for at most 30 days and 4,000 PINs; this contains no dealer/employee identities or assignments. Geometry must have closed, finite WGS84 Polygon/MultiPolygon rings and a matching requested PIN. Invalid responses, provider errors and absent polygons are not cached as successful geometry. Retries fetch only unresolved PINs, and missing areas remain explicitly unavailable rather than being guessed. This is a per-browser/origin cache, not a shared authoritative backend: first visits and cache expiration still depend on upstream availability. Server-side dealer geographic validation does not trust the browser cache.

## State context

`public/state-boundaries/IN-*.geojson` contains one outline for each of the 36 Indian states and union territories. Both map renderers load state highlights only for states with more than 50 current authenticated, filtered dealer markers, or for an explicitly selected state with matching dealers. Counts use dealer records, not distinct PIN codes or sidebar pagination; empty results remove highlights. Dealer markers and PIN polygons remain independent of this threshold. Outlines are cached and remain neutral grey context, not salesperson ownership, evidence of dealer accuracy, or coverage across an entire state. PIN polygons determine salesperson-colored coverage; a slate PIN with an amber outline contains dealers assigned to multiple salespeople.

- Delivery: [geoBoundaries gbOpen India ADM1 simplified geometry](https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/IND/ADM1/geoBoundaries-IND-ADM1_simplified.geojson), pinned revision `9469f09`.
- Source attribution in [the pinned metadata](https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/IND/ADM1/geoBoundaries-IND-ADM1-metaData.json): DataMeet India community and Election Commission of India.
- Source license in that metadata: [Creative Commons Attribution 2.5 India](https://creativecommons.org/licenses/by/2.5/in/). geoBoundaries also requests acknowledgment of its [CC BY 4.0 distribution](https://www.geoboundaries.org/); both source and delivery are linked in the map's Coverage info disclosure.
- Metadata boundary year: 2011; geoBoundaries build date: December 12, 2023. These are cartographic context, not a current legal-boundary certification.
- Retrieved for the full-state expansion: 2026-09-29.
- Pinned source SHA-256: `4c63fe43294a391e8f2de4e9f86f3edb60f8688275b9fee90c61fb2aa0c26061`.
- Regenerate with `node scripts/fetch-region-boundaries.mjs`; it validates the source hash and requires all 36 distinct ISO identifiers before writing assets.

`public/region-boundaries.geojson` remains the unchanged Telangana/Andhra Pradesh artifact used by existing geographic audit/repair scripts. Expanding map context does not silently change those scripts or mutate dealer data.

## Postal directory validation

- Dataset: All India Pincode Directory till last month
- Publisher/source authority: Ministry of Communications, Department of Posts, through the Open Government Data Platform India
- OGD resource: https://www.data.gov.in/resource/all-india-pincode-directory-till-last-month
- Delivery mirror used for the reproducible extract: https://github.com/dropdevrahul/pincodes-india/blob/main/pincode.csv
- License: Government Open Data License - India
- Retrieved: 2026-09-25
- Checked-in source SHA-256: `84af12fa29adddedfa9addcf46546000d89d2e2899b2993dc88050fafc8861e2`

`public/data/postal-directory-ap-ts.json` is the legacy-named checked-in extract containing 19,346 state-scoped entries across 19,300 distinct PIN codes throughout India. `npm run update:postal` recreates it from the all-India source and refuses to replace it when the result is unexpectedly small.

The source contains post-office and district terminology, not every colloquial neighborhood name. The app therefore verifies only exact normalized office/block matches. Similar spellings and unlisted local names remain unchanged and require human review; they are never silently corrected. The delivery mirror is used because unattended access to the official resource requires credentials or an interactive verification step; its source hash is recorded so updates are reviewable.

## Basemap

Map tiles and geographic context come from OpenStreetMap and remain attributed in the map controls.

## Dealer-point geocoding

Low-volume prototype lookups use the public OpenStreetMap Nominatim search service. A supplied full address is queried together with its area, PIN code, state, and country; results that explicitly report a different PIN code are rejected, and the resulting coordinates must pass the PIN-polygon check. Records without a full address use an approximate point inside the PIN polygon. The saved area name is compared with the postal office, block, and district names for that PIN; an area that also appears under a different PIN is a review signal, not authorization to change the PIN automatically. Colloquial area names do not always appear in the postal directory.

Geocoded coordinates are search results rather than surveyed storefront entrances. Operational use should add visual confirmation, provider-compliant caching, and a production geocoding service before route planning or bulk workloads.
