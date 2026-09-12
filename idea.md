# Dealer Territory Mapping

## Concept

Build an operational web app that shows salesperson coverage across Telangana and Andhra Pradesh. Each salesperson has a stable color, assigned territories use that color, uncovered territory remains grey, and dealer locations appear as pins.

## Problem

Sales leadership cannot quickly see who owns a geographic area, where dealers are located, or which areas have no assigned salesperson. The current source is a spreadsheet, and monthly retailer visits are coordinated without a shared geographic view.

## Audience

- Sales managers assigning and reviewing territories
- Salespeople checking their areas and dealer list
- Operations staff maintaining dealer and assignment data

## Core Jobs

- See salesperson ownership across all of Telangana and Andhra Pradesh at a glance.
- Identify uncovered areas immediately.
- Find a dealer by name, area, PIN code, or salesperson.
- Add one dealer manually or import dealers in bulk from Excel/CSV.
- Review questionable PIN-code and area combinations before relying on them.

## Initial Data Contract

- Salesperson name
- Dealer name
- Six-digit PIN code
- Area name
- State: Telangana or Andhra Pradesh

Exact street addresses are intentionally deferred. They will be required for reliable route optimization.

## Initial Scope

- Prototype with the 10 supplied dealer rows.
- OpenStreetMap raster tiles rendered with MapLibre.
- Responsive desktop and mobile experience.
- Client-side search, filters, manual entry, and spreadsheet import.
- A private hosted prototype for review.

## Constraints

- Scope is Telangana and Andhra Pradesh, not Hyderabad alone.
- A PIN centroid is only a dealer-location approximation; salesperson coverage uses PIN-code boundary polygons.
- PIN boundaries are the starting territory model and may later be replaced with districts, mandals, or manager-reviewed custom polygons.
- Dealer and employee assignment data is operational business data; keep access private by default.
- The current prototype stores edits in one browser and is not yet a shared system of record.

## Non-goals for the Prototype

- Route optimization or turn-by-turn navigation
- Exact-address geocoding
- Automated reassignment of conflicting territories
- Shared multi-user editing, authentication, audit history, or production database
- Claiming PIN boundaries are permanent business territories before sales-team review

## Open Questions

1. Should territories follow postal PIN boundaries, districts/mandals, or manager-drawn custom polygons?
2. Can one PIN code belong to more than one salesperson, and if so, what rule separates ownership?
3. Who may view, edit, approve, and export assignments?
4. Is the current private Sites deployment the intended long-term host, or only a review environment?
5. Which system should become the source of truth when shared persistence is added?
