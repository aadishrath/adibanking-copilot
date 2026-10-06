# Deployment and live/local parity

Updated October 6, 2026. The public app is [adibanking-copilot.vercel.app](https://adibanking-copilot.vercel.app/). README screenshots show the local production build, not a claim that every change is already deployed.

## Current checkpoint

All nine database migrations are applied to the configured Supabase project. The public demo login configuration is now included in vercel.json: it enables the selector and supplies exactly the three intentionally public sandbox identities. It does not depend on ignored local credential files. Supabase keys, database credentials, and transfer signing secrets remain private Vercel project environment variables. The live UI must be checked after each deployment; a successful local build alone does not establish deployed behavior.

## Hosting configuration

Use Node.js 22.x, install with npm ci, and build with npm run build. Vercel should use its Next.js preset. GitHub Actions verifies install, lint, type checking, unit tests, database tests, and build; it does not publish the site.

| Variable | Hosted value/purpose |
| --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | Dedicated demo Supabase project URL |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Public publishable/anon key, never a service key |
| SUPABASE_SERVICE_ROLE_KEY | Server-only admin directory and activity logging key |
| NEXT_PUBLIC_APP_URL | https://adibanking-copilot.vercel.app |
| BANKING_DATA_SOURCE | supabase in vercel.json; migrations and seeded identities already verified |
| CHAT_TRANSFER_SIGNING_SECRET | Random server-only value of at least 32 characters; consistent across instances |
| DEMO_LOGIN_ENABLED | true in vercel.json for this public sandbox deployment |
| DEMO_LOGIN_ACCOUNTS | Three public sandbox identities in vercel.json, synchronized with Supabase Auth |

No OpenAI key/model is required: the assistant uses application commands and owned data. DATABASE_URL and optional DATABASE_CA_CERT_PATH are for local migration tooling, not runtime banking. Do not upload .env.local or .env.demo-users.json. Add the production /auth/callback URL to Supabase's allowed redirect URLs and align the Auth Site URL with the app origin.

The vercel.json env entries are deliberately public demo configuration. For a private deployment, remove those entries and manage demo settings through Vercel Project Settings. After rotating demo passwords, update the allowlisted JSON in vercel.json and redeploy. Infrastructure credentials must never be added to that file.

Run npm run verify:public-demo after deployment. It checks all three published demo identities, database-backed account reads, activity writes, admin user directory access, and signed assistant transfer previews against the live URL. It never confirms a transfer. DEMO_TEST_URL can target a different deployment. The verifier needs the local Supabase public configuration and a trusted network connection; it never prints credentials or confirmation tokens.

## Release checks

1. Confirm the schema matches all nine migration filenames in the README. Never rerun committed migrations. Local build and database state must be deployed compatibly: persistent auth fails closed without the active-session helper, and data refresh requires the revision RPC. All nine migrations are already applied to the configured sandbox; deploy current app files to activate refresh and Logs. The activity writer requires the server-only service-role key.
2. Synchronize the hosted demo-password JSON; passwords changed to eight characters in Supabase. Confirm no private data shares the public demo project.
3. Run routine checks and a production build, then deploy through the project's normal Vercel/Git workflow.
4. Verify signed-out APIs return 401, protected pages redirect, and the former /mock-data/*.json URLs return 404. Verify role navigation, card advance/payment controls, and the assistant's signed confirmation.
5. With the ignored sandbox credentials available locally, run npm run verify:security using SECURITY_TEST_URL set to the deployed origin. Run other integration checks sequentially in the sandbox; mutation checks restore balances but retain reversal/audit history.

Fixtures are deliberately unavailable through public URLs. Database/API failures produce explicit errors without switching to sample data. See [security evidence](SECURITY.md), [authentication](AUTH_SETUP.md), and [database setup](BANKING_DATA_SETUP.md).
