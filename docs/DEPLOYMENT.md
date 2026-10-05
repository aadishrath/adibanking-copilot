# Deployment and live/local parity

Updated October 5, 2026. The public app is [adibanking-copilot.vercel.app](https://adibanking-copilot.vercel.app/). README screenshots show the current local production build, not a claim that every change is already deployed.

## Current checkpoint

All six database migrations are applied to the configured Supabase project, including seven account types, credit-card advances, and active-session security. Anonymous live API checks returned 401 without banking records. The last live-site check still found /mock-data/*.json publicly served; those files have been moved to server-only fixtures locally. Deploy the updated app to remove the hosted copies and receive the current UI, Proxy guards, and JSON origin checks. No deployment was performed during the documentation update.

## Hosting configuration

Use Node.js 22.x, install with npm ci, and build with npm run build. Vercel should use its Next.js preset. GitHub Actions verifies install, lint, type checking, unit tests, database tests, and build; it does not publish the site.

| Variable | Hosted value/purpose |
| --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | Dedicated demo Supabase project URL |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Public publishable/anon key, never a service key |
| SUPABASE_SERVICE_ROLE_KEY | Server-only admin directory key |
| NEXT_PUBLIC_APP_URL | https://adibanking-copilot.vercel.app |
| BANKING_DATA_SOURCE | supabase after migration/verification |
| CHAT_TRANSFER_SIGNING_SECRET | Random server-only value of at least 32 characters; consistent across instances |
| DEMO_LOGIN_ENABLED | true only for public sandbox identities |
| DEMO_LOGIN_ACCOUNTS | Allowlisted demo email/password/role JSON, synchronized with Supabase Auth |

No OpenAI key/model is required: the assistant uses application commands and owned data. DATABASE_URL and optional DATABASE_CA_CERT_PATH are for local migration tooling, not runtime banking. Do not upload .env.local or .env.demo-users.json. Add the production /auth/callback URL to Supabase's allowed redirect URLs and align the Auth Site URL with the app origin.

## Release checks

1. Confirm the schema matches all six migration filenames in the README. Never rerun committed migrations. Local build and database state must be deployed compatibly: persistent auth fails closed without the active-session helper.
2. Synchronize the hosted demo-password JSON; passwords changed to eight characters in Supabase. Confirm no private data shares the public demo project.
3. Run routine checks and a production build, then deploy through the project's normal Vercel/Git workflow.
4. Verify signed-out APIs return 401, protected pages redirect, and the former /mock-data/*.json URLs return 404. Verify role navigation, card advance/payment controls, and the assistant's signed confirmation.
5. With the ignored sandbox credentials available locally, run npm run verify:security using SECURITY_TEST_URL set to the deployed origin. Run other integration checks sequentially in the sandbox; mutation checks restore balances but retain reversal/audit history.

Fixtures are deliberately unavailable through public URLs. Database/API failures produce explicit errors without switching to sample data. See [security evidence](SECURITY.md), [authentication](AUTH_SETUP.md), and [database setup](BANKING_DATA_SETUP.md).
