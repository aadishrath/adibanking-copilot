# Sandbox banking workspace

The local app now uses Supabase (`BANKING_DATA_SOURCE=supabase`). Both customers and admins manage only their own financial records. Admins retain the separate user-directory feature; they do not bypass banking ownership.

## Available operations

| Table | Create | Read | Update | Delete |
|---|---|---|---|---|
| Accounts | Zero-balance checking/savings account, with currency | Own accounts and balances | Name and active/frozen/closed status | Only zero-balance accounts with no transaction/transfer history |
| Transactions | Sandbox income/expense with description and category | Own ledger, newest 200; local search | Manual transaction amount, description, category | Undo a manual entry's balance effect, then remove it |
| Transfers | Transfer between own active accounts in one currency | Own receipts, newest 200; local search | Amount, adjusting both balances and ledger entries | Reverse funds and archive the receipt; original/reversal history remains |

Opening balances, transfer-generated entries, and reversal entries cannot be edited/deleted through transaction CRUD. Account currency/type and a transaction's account cannot be changed after creation. A reversal or income deletion that would overdraw an account fails without changing anything. These are demonstration funds, not real deposits or payments.

All mutations use a database transaction, ownership checks, account locks, integer cents, and a saved operation result keyed by a retry UUID. Every CRUD operation retains an owner-scoped audit record in `banking_changes`; direct balance/ledger writes remain denied. Reversed transfers keep their original retry keys, so replay cannot recreate the funds movement.

## Applied data

`202610040002_crud.sql` is applied to the configured Supabase project. `demo-activity.sql` adds 12 manual income/expense entries spread over several dates plus one $125 transfer for each existing demo identity. Repeating the activity seed preserves user edits/deletions and does not add duplicate financial effects. Seeded record IDs are deterministic PostgreSQL UUIDs; the app accepts their UUID representation without requiring a randomly generated version.

Do not rerun a committed schema migration. To seed activity again on the migrated project:

```sh
npm run db:migrate -- --seed-only --activity
```

The three demo users' credentials remain in the ignored `.env.demo-users.json`. No credentials are included in documentation or screenshots.

## Verification

- `test:database`: runs both actual migrations and activity SQL locally; validates CRUD balance effects, protected records, owner denial, idempotent retries, failed-change rollback, reversal, seed repeatability, and per-account ledger totals.
- `verify:banking -- --app`: read-only schema/RLS and persistent API checks.
- `verify:crud`: runs sandbox mutations against the local app, including three concurrent retries for one transfer. Cleans up temporary manual entries/accounts and restores original balances. Retains a reversed transfer and audit history. Do not run it concurrently with read-only snapshot verification: its temporary account can legitimately appear between those reads.
- `verify:auth`: signed-out guards and admin/customer route checks in persistent mode.

Browser verification covers account create/edit/refresh, the deletion confirmation dialog, transaction create/edit, and search. Hosted API verification covers actual deletion, transfer editing/reversal, invalid fields, cross-owner mutation denial, and direct-write denial.

Current limits: record lists contain the newest 200 transactions/transfers; search works on those loaded rows. Server pagination, analytics, signup, grounded AI, and hosted deployment are future chunks.
