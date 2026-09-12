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

## Basemap

Map tiles and geographic context come from OpenStreetMap and remain attributed in the map controls.
