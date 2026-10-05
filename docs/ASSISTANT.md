# AdiBank banking assistant

The assistant handles a closed set of application requests. It reads the signed-in user's Supabase banking records and prepares sandbox transfers. Unsupported requests return “Cannot process this request” with the supported scope. No external model, web browsing, arbitrary code, external payments, or user-supplied instructions are executed.

## Supported prompts

| Request | Examples |
| --- | --- |
| Account balances | `show my accounts`, `how much money do I have`, `show balance for Checking` |
| Recent activity | `show my transactions`, `show my recent transactions` |
| Current-month analytics | `show my monthly summary`, `how much did I spend this month` |
| Expense categories | `show my spending categories`, `what am I spending money on this month` |
| Profile navigation | `profile help`, `how do I edit my profile` |
| Transfer preparation | `transfer 25.00 from checking to savings`, `make transfer from Checking account to Savings account for 25.00` |
| Help | `help`, `transfer help`, `what can you do` |

The summary currency selector supports USD, EUR, and GBP. Monthly queries use the browser's IANA timezone; transfers use the accounts' currency. An explicit currency such as `$25.00` or `EUR 25.00` must match both accounts. Money is parsed into integer cents without rounding.

Only complete recognized commands are accepted. Compound prompts, URLs, embedded instructions, or unknown phrasing are refused rather than partly executed. Account references match an exact owned name/ID or an unambiguous account type; partial matches are not guessed. For names containing reserved conjunctions such as “and”, use the account ID. This deliberate grammar restriction trades unrestricted conversation for an enforceable application scope. The OpenAI API key is not required or used by this assistant.

## Transfer confirmation and retries

1. Preparing a request reads current owned accounts and checks active status, same currency, different accounts, exact cents, and available funds or card credit. Mortgage/Loan sources are rejected; debt destinations cannot be overpaid. It does not move money.
2. The server signs a 15-minute proposal containing the owner, account IDs, amount, currency, expiry, and unique retry key. The UI shows the accounts and amount with **Confirm transfer** and **Cancel**.
3. Explicit confirmation submits only that signed token. The server verifies its integrity, owner, and expiry, then calls the existing atomic `transfer_funds` database function. Ownership, active Supabase session, status, currency, and available funds/credit are checked again at execution time.
4. Successful confirmation displays a database receipt and refreshes the current banking/analytics page. Repeated/concurrent confirmations reuse the same retry key and cannot make another transfer.
5. Before submitting, the UI persists an uncertain state in the user's browser history. If the response is lost or the page refreshes, **Retry confirmation** checks the same transfer. It does not silently generate a new key. Cancellation and history clearing are unavailable while the result is uncertain.
6. Expired confirmations refuse new execution and direct the user to transfer history before preparing another request. Reversed receipts cannot be recreated by replaying the original confirmation.

Chat history, including unresolved confirmations, is kept in per-user localStorage with a bounded 100-message history. It is not synchronized to other devices and is cleared on logout. If browser storage is blocked, history falls back to memory and refresh persistence is unavailable. Local cached data never grants authorization; the server validates every confirmation independently.

## Configuration and failure messages

Set `BANKING_DATA_SOURCE=supabase` after applying all six migrations listed in [database setup](BANKING_DATA_SETUP.md). The assistant reuses the banking RPCs, including card transfers and active-session security.

Set a server-only `CHAT_TRANSFER_SIGNING_SECRET` with at least 32 random characters on every instance of the deployment. Keep the value consistent across instances and restarts. Generate it with a cryptographic random generator; do not commit it or prefix it with `NEXT_PUBLIC_`. Rotating it invalidates outstanding proposals. Reads and help work without this secret; chat transfer preparation reports missing configuration and points to Transfers.

The UI distinguishes offline/network/timeout failures, a missing or invalid API response, expired/unavailable sessions, request limits, fixture-only banking, unavailable banking/analytics data, missing confirmation configuration, and an unconfirmed transfer outcome. It never claims success without a valid receipt. Requests time out after 30 seconds. The bounded 30-requests/minute rate limiter is per server process; distributed limiting remains future work.

`/api/assistant/chat` is the primary authenticated command endpoint. `/api/assistant/confirm` accepts `{token, confirmed: true}` only. The old `/api/openai/chat` URL remains a compatibility alias.

## Verification

Unit/API tests cover outside/compound requests, exact cents, malformed amounts, ambiguous/foreign accounts, currency/status/funds checks, token tampering/expiry/owner mismatch, explicit confirmation, failures, and retry-key retention.

With the configured local app running on port 3100:

```sh
npm run verify:assistant
```

This script performs actual sandbox transfers, concurrent confirmations, and reversal. It verifies balances are restored and retains the reversed receipt/audit history. Run it sequentially with other integration checks against a demo environment. Never use it against real financial data.

## Credit-card transfers and roles

Both customers and administrators use the same owned-data commands. Admin status does not permit chatting about another user's accounts. Try `transfer 200 from credit card to checking` for a cash-advance preview or `transfer 100 from checking to credit card` for a payment. Cash advances are limited by available credit, not current debt. The confirmation text explains that the advance increases debt and reduces credit; no interest or fees are simulated. A saved proposal still needs explicit confirmation and a current authorized session.

<img src="screenshots/mobile-chat-transfer.jpg" alt="Mobile assistant card cash-advance confirmation" width="375">

Unknown/outside requests are refused. Per-user browser history is cleared on logout; it is not a persistent cross-device conversation service. See [security audit](SECURITY.md) for token/session/owner checks.
