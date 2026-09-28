# Database migration verification — 2026-09-28

## Outcome and scope

Applied `drizzle/0008_ancient_veda.sql` through `npm run db:migrate` to the existing Vercel-linked Neon database. Post-application verification completed at 13:50 UTC (19:20 IST). Development and production use this same database, so this was a live additive schema change, not a development-only change.

No new Neon account, organization, project, or branch was created. No provider identity, authentication configuration, credential, account membership, application record, deployment, or Git remote was changed. The only live writes were two verified migration-history entries and Drizzle's migration `0008`.

## Recovery and rehearsal

- A custom-format `pg_dump` archive covers the `public` and `drizzle` schemas, including their table data and sequences. It is 165,688 bytes. It deliberately excludes Neon-managed authentication and cluster-wide roles; neither is affected by this migration.
- The private local archive is at `/Users/nikhilanjuri/.codex/backups/dealer-territory-map/2026-09-28-pre-0008-ZOeJXw/application.dump`. The directory is owner-only (`0700`) and the archive is owner-readable/writable (`0600`). It contains operational data and must not be committed or shared publicly.
- `manifest.json`, `tested.json`, and `applied.json` alongside it retain archive integrity, schema, migration hashes, timestamps, and table-count/digest evidence without connection secrets.
- The current SQL credentials permit database operations but not Neon management branch creation. Instead of changing accounts, the recovery test restored the archive into a network-isolated, disposable local Postgres 18 container, matching the live server's major version. This does not test Neon's managed Auth or point-in-time restore.
- The restored copy matched every application-table row count and digest. Migration rehearsal preserved those digests. Null retry keys remained supported for legacy records, while duplicate non-null order and route keys raised their expected unique-index violations. Test rows were rolled back.
- Both temporary database containers were removed after the test. The backup remains available. A future live restore would require a separate recovery decision and protection of writes made after this backup; no live restore was attempted.

## Migration-history reconciliation

The live Drizzle journal initially recorded `0000`–`0005`. All six timestamps and SHA-256 hashes matched the checked-in SQL. The schema from `0006` and `0007` was already present, but those migrations had no journal entries.

Replayed checked-in migrations `0000`–`0007` into a separate empty local Postgres 18 reference database and compared the relevant schema to the restored live copy:

- All 36 state enum values.
- Every `dealer_import_reviews` column, type, nullability, position, and default.
- Its validated primary-key, not-null, and foreign-key definitions, including deletion behavior.
- Its source-identity, status, and salesperson indexes.
- The nullable text `dealers.source_area` column and its default/position.

After these matched, inserted only the missing `0006`/`0007` journal records using the actual SQL-file hashes and original journal timestamps, in a transaction with an exclusive journal lock and a journal-state guard. Existing journal rows were not modified. The old schema statements were not replayed against live data.

## Live verification

`npm run db:migrate` applied the checked-in `0008` migration using the direct connection and existing Neon driver. Verified:

- Nullable text `commerce_orders.request_key` and `request_payload_hash`.
- Nullable text `route_plans.preview_key`.
- Valid unique indexes `commerce_orders_request_key_unique` and `route_plans_preview_key_unique`.
- Exactly nine journal rows, matching the SQL hashes and timestamps for `0000`–`0008`.
- Unchanged row counts and digests across all 18 public application tables. The data includes 2,064 dealers, 116 import-review records, 12 salespeople, 2,064 visit rules, two application accounts, and two role grants. Existing commerce orders, route plans/stops, and visits are empty.
- A second `npm run db:migrate` completed without another journal entry or schema change.
- `npm run verify` passed: all 101 tests, ESLint, TypeScript, and the production build. `git diff --check` also passed.

This verifies the migration and preservation of existing application data. It does not establish authenticated salesperson/administrator/retailer browser behavior, Google routing quality, weak-network replay, production UI readiness, or measured performance. Those remain separate rollout gates; nothing was deployed or pushed in this task.
