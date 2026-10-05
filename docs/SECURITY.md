# Security verification — 2026-10-05

## Findings and fixes

Signed-out requests to all 11 API routes returned HTTP 401 with an error body on both the local production build and the live Vercel deployment. Protected pages redirected to Login. A network response by itself does not mean banking data was returned; DevTools also retains earlier authorized responses after logout.

Two gaps were reproduced:

1. Static sample accounts and 50 sample transactions were downloadable at /mock-data/*.json without authentication. These are fixtures rather than Supabase customer records. Moved both JSON files to server-only lib/fixtures; old URLs return 404 in the rebuilt local app. The live deployment needs updating to remove its copies.
2. A saved, still-valid Supabase access JWT could query the database after its session was logged out, although the app rejected the old cookies. Applied 202610050003_session_security.sql to the configured Supabase project. A restricted helper verifies the JWT session_id against auth.sessions and its expiration. Restrictive policies protect accounts, transactions, transfers, and banking_changes. Both security-definer mutation functions explicitly check the session before any retry lookup or mutation. Trusted PostgreSQL migration connections may seed demo data; authenticated API callers cannot use that exception.

The app data access layer fails closed when the active-session check fails. Proxy now rejects signed-out API requests and redirects protected HTML/RSC requests before rendering, includes Transfers, and blocks customer access to admin paths. Page and API authorization remain in place behind Proxy. JSON mutation handlers reject mismatching Origin and cross-site fetch headers. Next.js Server Actions retain their built-in origin checks; updateProfile also validates the current user before updating only that user's metadata. User-supplied metadata never grants administrator access.

## Endpoint inventory

| Method | Path | Authorization |
| --- | --- | --- |
| GET | /api/accounts | Authenticated owner |
| GET | /api/transactions | Authenticated owner |
| GET | /api/banking | Authenticated owner |
| GET | /api/analytics | Authenticated owner via RLS |
| GET | /api/analytics/transactions | Authenticated owner via RLS |
| POST | /api/banking/manage | Authenticated owner, validated input, atomic RPC |
| POST | /api/transfer | Authenticated owner, atomic RPC |
| POST | /api/assistant/chat | Authenticated owner, strict app commands |
| POST | /api/assistant/confirm | Authenticated owner, signed and expiring confirmation |
| POST | /api/openai/chat | Same handler as assistant/chat |
| POST | /api/openai/transfer | Same handler as transfer |

/auth/callback is public by design and exchanges a Supabase one-use authorization code using the PKCE session. Login is public; logout revokes the current session; profile changes require authentication. Demo credentials on Login are intentionally public when DEMO_LOGIN_ENABLED is enabled. Service-role and signing secrets must remain server-only.

## Reproduce

Run npm run verify:security with a production build running on localhost:3100 (or set SECURITY_TEST_URL to the rebuilt app). It discovers the API routes and fails if a new route is missing from its audit. Checks include anonymous/malformed/forged/expired/revoked cookies, private/no-store cache headers, protected page and RSC requests, former public JSON/environment paths, both customers' API and RLS isolation, cross-user RPC mutations, admin-page denial, cross-origin requests, direct-write denial, and direct JWT replay after logout. Security checks do not change balances.

Run npm run test:database for session expiration, revocation, malformed/mismatched IDs, write RPC retry protection, ownership and atomicity tests. npm test covers API validation, assistant scope and signed confirmations. Build, lint, and existing auth/banking/assistant smoke checks verify legitimate behavior still works.

This documents the tested boundaries, not a guarantee against every possible vulnerability. Keep Supabase/Vercel configuration and dependencies maintained; do not place real customer information in this public demo.
