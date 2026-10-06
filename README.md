# AdiBank Copilot

**Try the live version: [adibanking-copilot.vercel.app](https://adibanking-copilot.vercel.app/).** No installation is needed to explore the hosted application. The repository continues to evolve, so deployment features may differ from the current local version. The demo-account dropdown appears when enabled by the deployment.

AdiBank Copilot is a portfolio banking application built by **aadish**. It combines account management, transaction history, sandbox transfers, monthly financial analytics, and an application-scoped banking assistant. It uses sample money and seeded identities with real authentication and a persistent database.

**For demonstration purposes only.** This is not a bank or payment service. Public demo identities share their sample records with visitors using the same login; enter only sample information.

## Purpose

The project demonstrates the full journey from signing in to understanding and managing financial activity. Visitors can explore an admin or customer account, review cash flow, drill into spending categories, and change sandbox records while keeping balances and ledger entries consistent.

Its engineering purpose is to connect a usable frontend to meaningful backend behavior: verified sessions, enforced ownership, exact money arithmetic, atomic database changes, and safe retries. Role-based navigation improves the experience, while independent server checks and database policies enforce access.

## Current features

- **Authentication:** Supabase email/password login, protected routes, cookie session refresh, logout, and an opt-in demo credential dropdown that fills the login form.
- **Profiles:** edit name, email, phone, city, and country. Email changes require Supabase confirmation.
- **Roles:** customers manage their own banking records and read their own logs. Admins also see the user directory and all users' interaction logs; banking workspace ownership remains enforced.
- **Analytics landing page:** six months of income, expenses, and net savings; current-month expense categories; clickable pie slices and keyboard-accessible legend buttons opening a transaction modal. Aggregation respects timezone and keeps currencies separate.
- **Accounts:** Checking, Savings, Retirement, Investment, Mortgage, Loan, and Credit Card. Create zero-balance accounts, rename them, change status, and delete empty accounts without history. Cards show amount owed, credit limit, available credit, purchases, and payment controls.
- **Transactions:** create, search, edit, and remove manual income/expense entries. Balance changes are atomic. Generated opening, transfer, and reversal entries are protected.
- **Transfers and cash advances:** move sandbox funds between the user's active accounts in the same currency, view receipts, edit amounts, and reverse/archive transfers. Cards can fund advances up to available credit, including amounts above the current debt balance. Mortgage/Loan accounts accept payments only. Retry keys prevent duplicate financial effects.
- **Banking assistant:** authenticated account/transaction retrieval, monthly summaries, spending categories, profile help, and signed transfer confirmations. Unsupported requests are refused; retries reuse the same transfer key.
- **UI:** responsive navigation, profile menu, forms, loading/error/empty states, and confirmation dialogs.

## Demo users and access

| Demo user | Role | Banking workspace | Extra access |
| --- | --- | --- | --- |
| AdiBank Admin — `admin@adibank.example` | Administrator | Own seven seeded account types, transactions, transfers, analytics, assistant, and profile | **Users** directory plus all-user logs with a user filter |
| Maya Patel — `maya@adibank.example` | Customer | Maya's own accounts, records, analytics, assistant, profile, and logs | No user-directory access |
| Alex Morgan — `alex@adibank.example` | Customer | Alex's own accounts, records, analytics, assistant, profile, and logs | No user-directory access |

Maya and Alex have the same features, with separate database ownership. The administrator has the same banking features, the user directory and all users' interaction logs. Admins cannot query or modify another user's banking workspace, but their log view includes other users' audit details such as transfer amounts and account names. The directory does not currently support changing roles or managing users. Roles come from protected Supabase `app_metadata`; profile edits cannot grant admin access.

The login dropdown fills the selected demo credentials. The three demo passwords are eight characters long. Anyone using the same public demo identity shares its sample records, so these are intended for a dedicated sandbox project.

## Screenshots

Captured from the current local production build on **October 5, 2026**, with seeded demonstration data. The live deployment may differ. Balances and transaction history can change when visitors edit the demo; verification transfers also leave reversal/audit entries.

**Login with the visible demo selector**

![Current demo-account selector](docs/screenshots/login-demo-dropdown.jpg)

**Customer view:** Maya's analytics and Customer profile menu; there is no Users link.

![Customer analytics and navigation](docs/screenshots/customer-dashboard.jpg)

**Administrator view:** the additional Users link opens the read-only directory.

![Administrator user directory and role menu](docs/screenshots/admin-user-directory.jpg)

**Credit-card cash advance:** available credit is the source limit, and borrowing increases the amount owed.

![Credit-card cash-advance preview](docs/screenshots/credit-card-cash-advance.jpg)

**iPhone 12 mini layout:** accounts use stacked cards at 375 × 812 CSS pixels.

<img src="docs/screenshots/mobile-accounts.jpg" alt="Current account cards at iPhone 12 mini width" width="375">

More captures: [full analytics](docs/screenshots/analytics-dashboard.jpg), [category transactions](docs/screenshots/analytics-category-modal.jpg), [all seven accounts](docs/screenshots/banking-workspace.jpg), and [phone assistant confirmation](docs/screenshots/mobile-chat-transfer.jpg).

Every signed-in page has a refresh icon with arrowheads beside its title. Banking pages check a private, per-user UUID revision before loading another batch of records or analytics. Database triggers rotate that token whenever accounts, transactions or transfers change; unchanged views display “Already up to date” and retain their data. Profile and user directory refresh their server-rendered content. Refresh is manual and also runs after an assistant transfer; this does not poll in the background. See [refresh behavior](docs/DATA_REFRESH.md).

## Account behavior

| Account type | Balance means | Can fund a transfer? | Can receive a transfer? |
| --- | --- | --- | --- |
| Checking / Savings | Available sandbox funds | Yes, up to funds available | Yes |
| Retirement / Investment | Simulated cash holdings | Yes, up to funds available | Yes |
| Mortgage / Loan | Amount owed | No | Yes, as a payment up to the debt |
| Credit Card | Amount owed | Yes, as a cash advance up to available credit | Yes, as a payment up to the debt |

All transfers require two different, active, owned accounts using the same currency. A card's available credit is its limit minus debt, rather than the amount displayed as its balance. The seeded card has a $5,000 limit, four purchases totaling $235.99, and a $100 checking payment, leaving $135.99 owed. A $200 cash advance is allowed and would increase the debt to $335.99 while adding $200 to the destination. This is a preview example, not an executed transfer.

Card purchases can be created, edited, or deleted in Transactions when the resulting debt remains valid. Payments and advances are created in the account controls or Transfers; amount edits/reversals adjust both balances atomically. Generated ledger entries are protected. No interest, fees, statement cycles, investment trading, or retirement withdrawal rules are simulated.

## Tech stack

| Layer | Technology | Purpose |
| --- | --- | --- |
| Application | Next.js 16 App Router, React 19, TypeScript | Server pages, client interactions, server actions, route handlers |
| Styling | Tailwind CSS 4 | Responsive layouts, forms, and cards |
| Authentication | Supabase Auth and SSR helpers | Verified users, cookie sessions, token refresh |
| Database | Supabase PostgreSQL | Accounts, ledger, transfers, audit/retry records, analytics |
| Authorization | Server role checks and PostgreSQL RLS | Admin-only directory and user-owned financial data |
| Validation | Zod | API input/output validation |
| Assistant | Closed command grammar, authenticated APIs, HMAC confirmations | Grounded reads and reviewed sandbox transfers without external model output |
| Testing | Jest, PGlite, hosted API verification scripts | Unit tests, actual SQL tests, integration checks |
| Delivery | Vercel, GitHub Actions, Node.js 22 | Live hosting and CI quality checks |

## Architecture and trade-offs

**Ownership is enforced at multiple layers.** The server verifies identity, active Supabase session state, and feature permissions. Row-level security scopes financial reads to the authenticated owner, and mutation functions check ownership and session state again. Revoked/expired sessions cannot read banking rows or replay mutations, even using a saved access JWT. Private fixture files live in `lib/fixtures`, outside publicly served assets; see the [security audit](docs/SECURITY.md). Service-role access stays server-only for setup, the admin directory and trusted log writes; normal banking uses authenticated user access.

**Money uses integer cents.** Bounded integer values and decimal-string parsing avoid floating-point rounding errors. This currently assumes two decimal places; exchange rates and currencies with different minor units are not implemented.

**Atomic changes prioritize correctness.** Account locks, balances, ledger entries, and saved retry results run together in PostgreSQL. The UI accepts canonical server balances rather than optimistic updates. This adds SQL complexity and request latency, but prevents partial changes and duplicate transfers.

**CRUD preserves ledger history.** Manual sandbox entries can be corrected or removed; generated entries are protected. Removing a transfer reverses funds and archives its receipt, preserving the original retry key. These constraints demonstrate reconciliation rather than production banking compliance.

**Persistent mode is explicit.** `BANKING_DATA_SOURCE=supabase` uses PostgreSQL; `demo` provides fixture-only reads. Failed database queries do not silently substitute mocks, which makes outages visible and prevents misleading success messages.

**Analytics and lists have different scaling limits.** Analytics aggregates full eligible history in PostgreSQL, excluding opening balances and internal transfers. Transaction/transfer lists currently load the newest 200 rows and search locally. Larger datasets need server filtering and pagination.

**The assistant uses an enforceable command scope.** Recognized commands retrieve owned data or prepare signed transfer confirmations. Unknown or compound prompts are refused, with no external-model dependency. This favors predictable banking behavior over unrestricted conversation. History is browser-local rather than cross-device, and rate limiting is per process; see [assistant behavior](docs/ASSISTANT.md).

**Public demo accounts make exploration easy.** The opt-in selector publishes only three designated sandbox credentials. Visitors sharing an identity can see each other's sample changes. Separate accounts are needed for privacy; signup and automatic account provisioning are not implemented yet.

## Run locally

Use the **[live app](https://adibanking-copilot.vercel.app/)** if you only want to try the project. Local development requires **Node.js 22.x**, npm, Git, and your own Supabase project with email/password authentication enabled. The banking assistant does not require an OpenAI API key.

### 1. Install

```sh
git clone https://github.com/aadishrath/adibanking-copilot.git
cd adibanking-copilot
npm ci
```

Copy the environment template:

```powershell
# Windows PowerShell
Copy-Item .env.example .env.local
```

```sh
# macOS / Linux
cp .env.example .env.local
```

### 2. Configure .env.local

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public key for authenticated user access |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only demo-user setup and admin directory key |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` for default local development |
| `DATABASE_URL` | Server-only PostgreSQL Session pooler URI on port 5432, for migrations |
| `BANKING_DATA_SOURCE` | `supabase` after setup; `demo` for fixture-only reads |
| `DEMO_LOGIN_ENABLED` | `true` to show public sandbox credentials on the login page |
| `DEMO_LOGIN_ACCOUNTS` | Optional JSON array for hosting; empty locally reads ignored `.env.demo-users.json` |
| `CHAT_TRANSFER_SIGNING_SECRET` | Server-only random secret of at least 32 characters for signed chat transfer confirmations |
| `DATABASE_CA_CERT_PATH` | Optional alternative Supabase root CA path |

Never commit `.env.local` or put database passwords, service-role keys, or OpenAI keys in `NEXT_PUBLIC_` variables. Set the Supabase Auth Site URL to the app origin and allow `http://localhost:3000/auth/callback` as a redirect URL.

### 3. Initialize a fresh sandbox database

Run this sequence **only against a new, dedicated demo project**. Schema migrations are one-time setup commands. If your project is already configured, skip migrations and inspect its applied schema first.

```sh
npm run seed:users
npm run db:migrate
npm run db:migrate -- --migration=202610040002_crud.sql
npm run db:migrate -- --migration=202610040003_analytics.sql --activity --analytics-activity
npm run db:migrate -- --migration=202610050001_account_types.sql --credit-activity
npm run db:migrate -- --migration=202610050002_credit_transfers.sql
npm run db:migrate -- --migration=202610050003_session_security.sql
npm run db:migrate -- --migration=202610050004_banking_revisions.sql
npm run db:migrate -- --migration=202610060001_activity_logs.sql
npm run db:migrate -- --migration=202610060002_lock_legacy_users.sql --schema-only
npm run verify:database-security
```

The scripts create three confirmed Supabase identities, seed all seven account types, card activity, and monthly analytics, and install atomic transfer/CRUD, analytics, and active-session protections. Eight-character demo passwords go into ignored `.env.demo-users.json`. After setup, set `BANKING_DATA_SOURCE=supabase` and optionally `DEMO_LOGIN_ENABLED=true`.

| Demo identity | Role |
| --- | --- |
| `admin@adibank.example` | Admin |
| `maya@adibank.example` | Customer |
| `alex@adibank.example` | Customer |

These `.example` addresses cannot receive email confirmations. Use `npm run seed:users -- --reset-demo-passwords` only to explicitly reset the three designated demo passwords; keep any hosted `DEMO_LOGIN_ACCOUNTS` value synchronized. Repeated user seeding preserves existing users and passwords. See [authentication setup](docs/AUTH_SETUP.md) and [database setup](docs/BANKING_DATA_SETUP.md) for details and connection troubleshooting.

### 4. Start

```sh
npm run dev
```

Open [localhost:3000](http://localhost:3000). Choose a demo identity, then click **Sign in**. If the selector is disabled, enter credentials from your local credential file manually.

For a local production build:

```sh
npm run build
npm start
```

## Verification

Routine checks do not require a hosted database:

```sh
npm run lint
npm run type-check
npm test
npm run test:database
npm run build
```

Database tests run actual SQL in isolated PGlite PostgreSQL, including RLS, exact-cent arithmetic, retries, rollback, card limits/advances, analytics boundaries, revoked/expired sessions, and legacy-table lockdown. The latest checkpoint has 53 unit/API tests and 13 database tests. Run `npm run verify:database-security` to inspect every public table's RLS and API grants, including tables unused by the app.

For integration checks, run the app on port 3100 (`npm run dev -- --port 3100`) with configured, seeded Supabase data:

```sh
npm run verify:auth
npm run verify:banking -- --app
npm run verify:analytics
npm run verify:assistant
npm run verify:security
# Sandbox mutations: restores balances, retains audit/reversal history.
npm run verify:crud
npm run verify:credit-card
```

Run these sequentially against a disposable demo environment. CRUD checks create temporary records, so concurrent read checks may observe intermediate state. Browser flows have been manually checked; automated Playwright, performance/Lighthouse tests, and production monitoring remain future work. GitHub Actions runs routine checks, not deployment.

## Structure and next steps

```text
app/          Pages, auth actions, protected APIs, shared layout
components/   Login, navigation, banking workspace, analytics, assistant
lib/          Auth, data adapters, validation, money and analytics helpers
supabase/     SQL migrations, sample data, database certificate bundle
scripts/      Setup, diagnostics, integration verification
tests/        Unit and isolated PostgreSQL tests
docs/         Setup, behavior, screenshots, deployment notes
```

Read [security verification](docs/SECURITY.md), [screenshot inventory](docs/screenshots/README.md), [implementation progress](docs/PROGRESS.md), [banking operations](docs/CRUD_WORKSPACE.md), [analytics](docs/ANALYTICS.md), and [deployment configuration](docs/DEPLOYMENT.md) for deeper details. Remaining work includes signup/provisioning, server pagination, fuller transaction/transfer detail flows, spending comparisons, cross-device assistant conversations, and broader automated workflow coverage. See [responsive UI](docs/RESPONSIVE_UI.md) for the phone/tablet layout and [assistant](docs/ASSISTANT.md) for supported prompts, configuration, and failure handling.

---

© 2026 aadish. Built by aadish. For demonstration purposes only. This notice identifies the author and demo purpose; it does not establish an open-source license.

Interaction logging: see [activity logs](docs/ACTIVITY_LOGS.md) for event coverage, 25-row pagination, type-only search, admin filtering and audit limitations.
