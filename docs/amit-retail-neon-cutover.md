# Amit Retail to Neon Cutover

## Status

The application and schema migration is implemented in this repository. Runtime catalog, retailer, order, role, and product-image operations use Neon Postgres and Neon Auth; no application route depends on Supabase.

The legacy data copy is not yet verifiable. The Supabase URL configured in `/Users/nikhilanjuri/GitHub/amit-retail/.env.local` no longer resolves, and that project is not present in the currently authenticated Supabase account. The target Neon database therefore has no recovered legacy catalog, retailer, order, or image rows. Do not interpret an empty target as evidence that the source was empty.

## Source-to-target mapping

| Supabase source | Neon target | Notes |
| --- | --- | --- |
| `categories` | `commerce_categories` | Preserves the source UUID in `legacy_supabase_id`. |
| `products` | `commerce_products` | Preserves category links, active state, timestamps, and source image URLs. |
| `product_variants` | `commerce_product_variants` | Converts rupees to integer paise and preserves SKU, MOQ, and stock state. |
| Storage `product-images` objects referenced by products | `commerce_product_images` | Downloads and stores the bytes, content type, source URL, and position in Neon. |
| `profiles` and `pending_retailers` | `commerce_legacy_retailers` | Stages identity metadata for explicit account/dealer reconciliation; OTP identities and passwords are not copied. |
| `orders` | `commerce_orders` | Preserves source IDs, retailer snapshots, status, totals, notes, and timestamps. Unmatched historical orders may remain intentionally unlinked to a canonical dealer. |
| `order_items` | `commerce_order_items` | Preserves source IDs, quantities, and price snapshots. |

Supabase Auth users are intentionally not copied. Administrators create Neon Auth username/password accounts and link retailers to canonical dealer records. Exact normalized phone equality may identify an existing retailer account; shop-name similarity alone never does.

## Run the one-time import

Use a temporary source service-role key only in the shell environment. Do not commit it to `.env.local`, a migration, logs, or documentation.

First inspect source counts without writing:

```bash
SUPABASE_MIGRATION_URL=https://SOURCE_PROJECT.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=temporary-source-key \
npm run db:migrate:amit-retail
```

After reviewing the counts and confirming the target Neon connection, apply the idempotent import:

```bash
SUPABASE_MIGRATION_URL=https://SOURCE_PROJECT.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=temporary-source-key \
npm run db:migrate:amit-retail -- --apply
```

Revoke the temporary service-role key after the migration. The importer stops on missing referenced products, variants, orders, or image objects rather than silently dropping them.

## Acceptance gate before deleting the old repository

- Source and target category, product, variant, retailer, order, and order-item counts are reconciled.
- Every referenced product image exists in Neon and representative images render through an authenticated session.
- Order totals and line-item price snapshots match representative source orders.
- Every staged legacy retailer is either linked to the correct canonical dealer/account or explicitly retained as historical/unmatched.
- Retailer, operations-staff, salesperson-plus-operations, and administrator journeys pass with username/password login and no OTP path.
- Twilio notifications are either configured and tested or explicitly accepted as disabled.
- A recoverable source export is retained until the above checks pass.

Only after this gate passes is deleting `/Users/nikhilanjuri/GitHub/amit-retail` safe.
