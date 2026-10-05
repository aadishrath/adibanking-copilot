# Persistent banking database

Updated October 5, 2026. The local app runs in BANKING_DATA_SOURCE=supabase mode with user-owned data. All six migrations below have been applied to the configured demo Supabase project. Do not rerun them there. The [README](../README.md#run-locally) provides the full fresh-project setup; [deployment](DEPLOYMENT.md) distinguishes hosted database state from deployed app files.

## Migration order for a new sandbox

| Migration | Purpose |
| --- | --- |
| 202610040001_banking.sql | Accounts, ledger, transfers, ownership RLS, atomic transfer RPC |
| 202610040002_crud.sql | Atomic CRUD, retry/audit records, transfer amount edits and reversals |
| 202610040003_analytics.sql | Full-history monthly/category analytics under RLS |
| 202610050001_account_types.sql | Seven account types, amount-owed semantics, credit limits and payments |
| 202610050002_credit_transfers.sql | Card cash advances up to available credit; correct edits/reversals |
| 202610050003_session_security.sql | Active-session checks for reads and write RPCs; logout JWT replay denial |

The base migration archives only recognized, empty legacy prototype tables under the private banking_legacy schema, inside its transaction. Populated/unknown tables, external dependencies, custom triggers, or existing archives are refused. It does not drop data or guess ownership. Do not expose banking_legacy through Supabase's API.

## Seed data

- seed.sql creates Checking/Savings accounts and matching signed opening ledger entries for the allowlisted existing demo users.
- demo-activity.sql adds representative income/expenses and an internal transfer.
- demo-analytics-activity.sql adds representative current-month activity once per user/month.
- demo-credit-activity.sql adds Retirement, Investment, Mortgage, Loan, and Credit Card accounts, four card purchases, and a $100 checking-to-card payment.

The card starts with a $5,000 limit and $135.99 owed after its sample payment. Retirement/Investment holdings are simulated cash; Mortgage/Loan balances represent debt. Seeds use saved retry keys/deterministic IDs and preserve later edits. On a migrated project, repeat only the selected seeds:

~~~sh
npm run db:migrate -- --seed-only --activity --analytics-activity --credit-activity
~~~

Schema and seed are separate transactions. If a migration committed but seeding failed, inspect the database and retry with --seed-only. Do not rerun the committed schema change. The runner requests a PostgREST schema reload and does not silently change BANKING_DATA_SOURCE.

## Connection configuration

Set server-only DATABASE_URL in ignored .env.local to the configured project's PostgreSQL Session pooler URI on port 5432. The service-role API key does not provide a schema connection. URL-encode special characters in database passwords. Never paste credentials into chat or place them in NEXT_PUBLIC_ variables. Alternatively, apply reviewed SQL through Supabase's SQL editor.

The runner verifies the project target, endpoint hostname, and TLS certificate; its default Supabase CA bundle is documented in [CERTIFICATES.md](../supabase/CERTIFICATES.md). DATABASE_CA_CERT_PATH can select another trusted project CA. npm run db:diagnose performs sanitized read-only network/parser checks. If direct IPv6 is unreachable, use the Session pooler. After a password rotation, temporary pooler credential caching can cause 28P01; inspect configuration and retry before resetting passwords repeatedly. In this environment, a later verified-TLS pooler connection succeeded without another reset; the specific server-side cache event was not independently confirmed.

## Ownership, money, and sessions

All amounts use bounded integer cents. Accounts, transactions, transfers, and banking_changes are owner-scoped. Composite foreign keys prevent referencing another owner's account/receipt. Both roles have the same financial ownership restrictions; service-role use stays limited to setup and the authorized user directory.

Authenticated users cannot write tables directly. transfer_funds and manage_banking_record validate ownership, active status, currencies, balances/credit, exact amounts, and retry details before atomic updates. Account locks are acquired in stable order. Card advances increase debt and destination funds; debt payments decrease the source funds and destination debt. Generated entries remain protected, and reversals preserve receipts/audit history.

has_active_banking_session checks the JWT session ID against auth.sessions, including session expiration and user identity. Restrictive SELECT policies and explicit mutation checks reject revoked/expired sessions, even with a previously valid access JWT. Trusted PostgreSQL seed connections are separate from authenticated API callers. Fixture-only mode uses private lib/fixtures and provides no persistent mutation; database errors never silently substitute fixtures.

## Verification

~~~sh
npm run test:database
npm run verify:banking -- --app
npm run verify:crud
npm run verify:credit-card
npm run verify:analytics
npm run verify:assistant
npm run verify:security
~~~

Hosted scripts require the configured app, normally localhost:3100. Run them sequentially against disposable demo data. Read checks verify schema/API visibility and customer isolation; mutation checks restore balances and retain reversed receipts/audit records. Actual SQL tests cover legacy upgrades, rollback, exact cents, concurrency/retry semantics, CRUD, card limits/advances, analytics boundaries, and session revocation. Auth/banking/assistant/security hosted checks have passed at the latest checkpoint; this is not a certification of production banking behavior.
