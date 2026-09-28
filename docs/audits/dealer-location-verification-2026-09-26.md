# Dealer PIN-location verification — 2026-09-26

Scope: all 2,064 dealer rows in the configured Neon database, at one dealer per row. PIN-based points remain approximate; this audit does not establish storefront addresses.

## Result

- 2,064/2,064 points lie inside a polygon for their saved PIN and state after the 2024 gap-filling layer and one documented state-label correction are applied.
- 0 points are outside a matching PIN polygon; 0 PINs lack a usable polygon; 0 have an unresolved polygon/postal-state conflict.
- Telangana and Andhra Pradesh points were separately checked against the checked-in state outlines; 0 fall outside them. That independent state-outline check does not cover other states.
- The 16 previously unresolved dealers belonged to four PINs: 500095 (11), 507111 (3), 500025 (1), and 523156 (1). Eight original points were already inside the 2024 polygons; eight were moved to a safe interior point. After geographic verification, eight records retained their original postal-area review status; eight returned to their original postal-verified status.

## Evidence and method

The reproducible read-only command is `npm run db:audit-dealer-locations`; its row-level output is `outputs/dealer-location-audit.json` (ignored by Git). The correction used `scripts/resolve-unmapped-pin-locations.ts` with a guarded before-state check and an ignored local backup. The primary polygon layer is [Esri India PINCode Boundary 2025](https://livingatlas.esri.in/server1/rest/services/India/Pincode_Boundary_2025/MapServer/0); the missing polygons came from [Esri India Postal Code Boundaries 2024](https://livingatlas.esri.in/server/rest/services/IAB2024/IN_Postal_Code_Boundaries_2024/MapServer/0). PIN/state and area checks used the checked-in all-India postal directory. For PIN 507111, [India Post's Telangana listing](https://www.indiapost.gov.in/VAS/Pages/News/RevListofPOs.pdf) and the polygon's own Telangana Circle field resolve an obsolete Andhra Pradesh `state` label; the original label remains recorded in `original_state`.

This establishes PIN-level geographic consistency only. Dealers without full verified addresses must not be treated as exact route stops. The eight remaining area-name reviews are not geographic failures; they require confirming the business's locality wording against its PIN.
