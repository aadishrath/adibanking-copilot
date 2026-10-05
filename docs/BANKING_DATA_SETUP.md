# Persistent banking data: activated locally

## Current state

The application now reads financial data through authenticated server APIs. `BANKING_DATA_SOURCE=demo` (the default) intentionally keeps the existing demonstration working. There is no automatic fallback from failed database queries to demo data.

On October 4, both banking migrations and the richer activity seed committed successfully to the configured Supabase project. The local app now uses persistent Supabase data. Hosted read/mutation ownership checks, concurrent transfer retries, CRUD balance effects, reversal, and authenticated app API verification pass. See [CRUD workspace](./CRUD_WORKSPACE.md) for operations and test limitations. Hosted deployment activation remains outstanding.

The October 4 hosted preflight found **empty legacy `accounts` and `transactions` tables**, with no `transfers` table or `transfer_funds` function. Those legacy tables are incompatible with the adapter. The migration now recognizes their exact column layout and archives them under the private `banking_legacy` schema before creating the canonical tables. It revokes public/customer access to the archived tables. This happens in the same transaction as the migration: a later failure restores the original schema.

This upgrade refuses populated legacy tables, unknown layouts, dependent views/foreign keys, custom triggers, or an existing archive schema. It does not drop tables or guess ownership. If any refusal occurs, stop and review the database rather than bypassing the guard. Do not add `banking_legacy` to Supabase's exposed API schemas.

## Activation checklist

1. **Completed:** `supabase/migrations/202610040001_banking.sql` applied to the configured project. It preserves recognized empty legacy tables privately. Do not rerun this one-time migration.
2. **Completed:** `supabase/seed.sql` populated checking/savings accounts and matching opening ledger entries for the three existing demo users. Repeating only this seed preserves balances and entries.
3. **Passed:** `npm run verify:banking`. This read-only preflight checks required columns, exposed function metadata, seeded accounts, two signed-in customers' RLS isolation (without an owner filter), direct cross-owner queries, and anonymous access. It terminates its test sessions and never moves money. A successful read check does not certify mutation permissions or transfer behavior.
4. **Completed locally:** `BANKING_DATA_SOURCE=supabase`; `verify:banking -- --app` passes. The app runs on port 3100 for verification (override `BANKING_TEST_URL`). Authenticated API responses return persistent records scoped to the customer's account IDs.
5. **Hosted API checks passed:** direct-write denial, CRUD ownership, transfer idempotency/concurrent retries, editing/reversal, and balance restoration. Browser CRUD checks also pass. Deployment activation, dedicated transfer confirmation/detail UX, and wider workflow testing remain pending. `verify:auth` supports both demo and persistent mode without making a transfer.

## Database connection needed for agent-applied SQL

The service-role API key can manage Auth and query authorized tables, but it does not supply a PostgreSQL schema connection. To apply SQL from the local repository, add a server-only `DATABASE_URL` to the ignored `.env.local`. In the Supabase dashboard's **Connect** dialog, choose the **Session pooler** connection and replace its password placeholder with the actual database password (URL-encode special characters). See [Supabase's connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres). Never prefix this variable with `NEXT_PUBLIC_` or paste its value into chat. Alternatively, run the migration and seed directly in the project's SQL editor; that does not require sharing database credentials locally.

`DATABASE_URL` is only for migration tooling. Runtime banking continues to use Supabase's authenticated API and RLS. A connection string alone does not activate the schema or switch data modes.

Run `npm run db:migrate` to apply the migration and then the repeatable demo seed. The runner checks that the connection targets the configured project, requires verified TLS, and requests a PostgREST schema refresh. It does not switch `BANKING_DATA_SOURCE`. Use the Session pooler (port 5432) if the direct endpoint's IPv6 address is unreachable. The default CA bundle comes from the official Supabase CLI; its provenance is in `supabase/CERTIFICATES.md`. If the project needs a different CA, download it from Supabase and set `DATABASE_CA_CERT_PATH` to the local file; certificate verification stays enabled.

The migration and seed are separate transactions. If the migration succeeds but the seed fails, inspect the database and run `npm run db:migrate -- --seed-only` to retry only the seed. Do not rerun the one-time schema migration after it has committed. The runner keeps credentials and raw database error details out of logs.

## Connection diagnosis after the password reset

`npm run db:diagnose` checks file/environment overrides and driver parsing, then performs verified-TLS read-only probes with explicit connection fields. It prints no credentials. In this project, the direct endpoint is IPv6-only and unreachable from this machine. The Session pooler is reachable, and the file username/password survive driver parsing unchanged with no environment override.

The pooler initially returned `28P01` after the reset, then accepted the saved credentials. The ordinary URL-based migration runner subsequently connected and committed successfully without another password change. This is consistent with Supabase's documented [temporary pooler credential cache after password rotation](https://supabase.com/docs/guides/troubleshooting/supavisor-error-password-authentication-failed-after-password-rotation), rather than evidence that the copied password was wrong. Server-side logs were not inspected, so the precise cache event is inferred. Avoid repeated password resets while diagnosing this condition.

## Data and authorization

- All persisted monetary amounts are bounded integer cents. UI decimal amounts are parsed from text without floating-point multiplication or rounding.
- Every account, transaction, and transfer has an owner. Composite foreign keys prevent entries referencing another owner's account or transfer.
- Authenticated users may select their own rows through RLS. They cannot directly write balances or ledger rows, and admins do not bypass financial-data ownership.
- `transfer_funds` is the only granted user mutation. It verifies ownership, status, currency, funds, amount, and idempotency before atomically updating two balances and inserting the transfer and two ledger entries.
- Retries with the same key return the original transfer. Reusing a key for different details fails. The client retains the key while retrying an open dialog and accepts canonical server balances rather than inventing local transactions.
- The procedure locks accounts in consistent order and serializes same-key requests. Hosted concurrent-request testing remains outstanding.

## Local verification

`npm run test:database` runs the actual migration and seed SQL against an isolated PGlite PostgreSQL runtime. The test supplies stand-ins for Supabase's `auth.users`, roles, and `auth.uid()`.

It verifies repeated seeding, per-user RLS, rejected direct writes, rejected anonymous reads/function calls, exact 29-cent transfers, ledger conservation, idempotent retry, conflicting retries, cross-user denial, insufficient funds, negative amounts, and rollback after a forced ledger-insertion failure. Upgrade tests also cover empty legacy archival, private archive access, populated/unknown-schema refusal, dependent-view refusal, and rollback of archival if a later migration statement fails.

This is meaningful PostgreSQL validation, not confirmation that the hosted Supabase project has been migrated. Hosted RLS, session refresh, cross-request concurrency, and a browser transfer/refresh/receipt flow must still be verified before marking Phase 2 complete.
