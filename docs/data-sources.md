# Data Sources

## PIN-code boundaries

- Dataset: All India PIN Code Boundary GeoJSON
- Publisher/source authority: Ministry of Communications, Department of Posts, surfaced through the Open Government Data Platform India
- Delivery layer used by this prototype: Esri India Living Atlas `Pincode_Boundary_2025` feature service
- Service URL: https://livingatlas.esri.in/server1/rest/services/India/Pincode_Boundary_2025/MapServer/0
- OGD catalog URL: https://www.data.gov.in/catalog/all-india-pincode-boundary-geo-json
- License: Government Open Data License - India
- Retrieved: 2026-09-12
- Coordinate system in the checked-in extract: WGS 84 longitude/latitude (`EPSG:4326`)

The checked-in `public/pincode-boundaries.geojson` contains the nine unique PINs in the supplied sample. The app queries the same feature service for a new valid PIN when a dealer is added or imported.

These polygons are the current territory unit, not a permanent business rule. Sales leadership should review whether postal boundaries match real salesperson ownership before production use.

## State context

`public/region-boundaries.geojson` contains the Telangana and Andhra Pradesh state outlines used to show overall scope and grey unassigned geography. It is visual context; PIN polygons determine colored coverage.

## Postal directory validation

- Dataset: All India Pincode Directory till last month
- Publisher/source authority: Ministry of Communications, Department of Posts, through the Open Government Data Platform India
- OGD resource: https://www.data.gov.in/resource/all-india-pincode-directory-till-last-month
- Delivery mirror used for the reproducible extract: https://github.com/dropdevrahul/pincodes-india/blob/main/pincode.csv
- License: Government Open Data License - India
- Retrieved: 2026-09-14
- Checked-in source SHA-256: `84af12fa29adddedfa9addcf46546000d89d2e2899b2993dc88050fafc8861e2`

`public/data/postal-directory-ap-ts.json` contains 1,919 state-scoped entries across 1,902 distinct PIN codes after filtering the source directory to Telangana and Andhra Pradesh. `npm run update:postal` recreates the file and refuses to replace it when the extract is unexpectedly small.

The source contains post-office and district terminology, not every colloquial neighborhood name. The app therefore verifies only exact normalized office/block matches. Similar spellings and unlisted local names remain unchanged and require human review; they are never silently corrected. The delivery mirror is used because unattended access to the official resource requires credentials or an interactive verification step; its source hash is recorded so updates are reviewable.

## Basemap

Map tiles and geographic context come from OpenStreetMap and remain attributed in the map controls.

## Dealer-point geocoding

Low-volume prototype lookups use the public OpenStreetMap Nominatim search service. A supplied full address is queried together with its area, PIN code, state, and country; results that explicitly report a different PIN code are rejected. Records without a full address use an approximate PIN-code point.

Geocoded coordinates are search results rather than surveyed storefront entrances. Operational use should add visual confirmation, provider-compliant caching, and a production geocoding service before route planning or bulk workloads.
