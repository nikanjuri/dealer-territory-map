# Dealer Territory Mapping

## Concept

Build an operational web app that shows salesperson coverage across Telangana and Andhra Pradesh. Each salesperson has a stable color, assigned territories use that color, uncovered territory remains grey, and dealer locations appear as pins.

## Problem

Sales leadership cannot quickly see who owns a geographic area, where dealers are located, or which areas have no assigned salesperson. The current source is a spreadsheet, and monthly retailer visits are coordinated without a shared geographic view.

## Audience

- Sales managers assigning and reviewing territories
- Salespeople checking their areas and dealer list
- Operations staff maintaining dealer and assignment data
- Salespeople planning daily visits and recording completed dealer calls

## Core Jobs

- See salesperson ownership across all of Telangana and Andhra Pradesh at a glance.
- Identify uncovered areas immediately.
- Find a dealer by name, area, PIN code, or salesperson.
- Add one dealer manually or import dealers in bulk from Excel/CSV.
- Review questionable PIN-code and area combinations before relying on them.
- Build an efficient daily route from the dealers due for a visit and retain visit history.
- Let administrators review route and visit activity without planning or updating routes on a salesperson's behalf.

## Initial Data Contract

- Salesperson name
- Dealer name
- Six-digit PIN code
- Area name
- State: Telangana or Andhra Pradesh
- Full street address (optional; enables address-level pin placement)

Records without a full address keep an approximate PIN-code point. Full addresses improve point placement and must be reviewed before a dealer is included in route optimization.

## Initial Scope

- Prototype with the 10 supplied dealer rows.
- Google Maps as the selected production map, with MapLibre/OpenStreetMap retained as a resilience fallback.
- Responsive desktop and mobile experience.
- Client-side search, filters, manual entry, and spreadsheet import.
- Optional full-address geocoding for dealer pins.
- A shareable public prototype hosted on Vercel.
- Shared authenticated persistence in Neon Postgres.
- A route-planning foundation for visit frequency, daily plans, stops, and completed visits.
- Username-based accounts with administrator and salesperson roles.

## Constraints

- Scope is Telangana and Andhra Pradesh, not Hyderabad alone.
- A PIN centroid is only a dealer-location approximation; salesperson coverage uses PIN-code boundary polygons.
- PIN boundaries are the starting territory model and may later be replaced with districts, mandals, or manager-reviewed custom polygons.
- Shared operational data requires authentication and server-enforced role scoping.
- Administrators can manage the team and dealer records; salespeople can access only their own dealers, territories, routes, and visit updates.
- Salespeople plan and operate their own routes. Administrators have read-only route oversight across the team.
- Administrators set up each salesperson's username and initial password from Team, and can replace a forgotten password without viewing the existing one.
- One dealer record has one salesperson owner. A matching dealer name plus PIN or full address must be reassigned by an administrator instead of duplicated under another salesperson.

## Non-goals for the Prototype

- Turn-by-turn navigation inside this app; planned routes may hand off to Google Maps navigation.
- Continuous background employee tracking; visits use explicit foreground actions.
- Automated reassignment of conflicting territories
- Treating approximate PIN-code points or preview ordering as field-ready navigation.
- Claiming PIN boundaries are permanent business territories before sales-team review

## Open Questions

1. Should territories follow postal PIN boundaries, districts/mandals, or manager-drawn custom polygons?
2. Can one PIN code belong to more than one salesperson, and if so, what rule separates ownership?
3. Should managers eventually have a middle role between administrator and salesperson?
4. What are the normal workday start/end, average visit duration, route start/end locations, and daily stop target?
