# Authentication, demo users, and roles

Updated October 5, 2026. Use a dedicated Supabase sandbox with email/password authentication. [Live demo](https://adibanking-copilot.vercel.app/) · [Local setup](../README.md#run-locally) · [Security audit](SECURITY.md).

## Differences between users

| User | Role | Available features |
| --- | --- | --- |
| AdiBank Admin — admin@adibank.example | Administrator | Own banking workspace, analytics, transfers/cash advances, assistant, profile; own logs; additional Users directory and all-user logs with a user filter |
| Maya Patel — maya@adibank.example | Customer | Own banking workspace, analytics, transfers/cash advances, assistant, profile, own logs |
| Alex Morgan — alex@adibank.example | Customer | Same features as Maya, with separately owned records |

Every seeded identity has seven account types. Equal-looking seed balances do not mean records are shared across identities. Banking RLS applies equally to administrators and customers. An admin can view names, emails, roles, and creation dates in the directory, but cannot edit roles or manage users from that screen. Customers navigating directly to /admin/users are redirected to /dashboard.

![Customer role and navigation](screenshots/customer-dashboard.jpg)

![Administrator role and user directory](screenshots/admin-user-directory.jpg)

Roles are derived from Supabase app_metadata.role, which ordinary profile edits cannot change. User metadata stores the allowed name/contact fields. Signup and automatic account provisioning remain unimplemented.

## Configuration and credentials

Copy .env.example to .env.local. Set NEXT_PUBLIC_SUPABASE_URL and a public publishable/anon key; keep SUPABASE_SERVICE_ROLE_KEY private. Set NEXT_PUBLIC_APP_URL to the app origin and allow that origin's /auth/callback URL in Supabase Auth. For full banking, apply all eight migrations in the order documented in the README and set BANKING_DATA_SOURCE=supabase.

npm run seed:users creates/auto-confirms only the three designated demo identities and writes eight-character demo passwords to ignored .env.demo-users.json. Repeat runs preserve existing users and passwords. Explicit rotation is:

~~~sh
npm run seed:users -- --reset-demo-passwords
~~~

DEMO_LOGIN_ENABLED=true shows the highlighted selector. Local credentials are loaded server-side from the ignored file. For hosting, set DEMO_LOGIN_ACCOUNTS to the allowlisted email/password/role JSON array and synchronize it after rotating Supabase passwords. The selector intentionally publishes sandbox credentials; never enable it in a project containing private user data or commit service/database credentials.

![Current demo selector](screenshots/login-demo-dropdown.jpg)

These .example addresses cannot receive confirmation email. Editing a profile's email requires Supabase confirmation using real inboxes; delivery has not been verified for the demo identities.

## Sessions and logout

The server verifies auth.getUser() and, in persistent banking mode, the active database session. Proxy refreshes cookies, rejects signed-out APIs, redirects protected pages, and guards admin paths. Authorization is also checked inside pages/actions/API handlers. Cookies are HTTP-only, SameSite=Lax, and Secure in production; responses containing user data use private/no-store caching.

Logout revokes the current Supabase session, removes its cookies, then clears that user's browser chat state and replaces the browser document with Login. This discards the previous user's navbar, menu, assistant, and cached client tree. Other devices remain signed in. Active-session RLS policies and write RPC checks reject saved JWTs from the revoked session, rather than waiting for access-token expiry. A failed logout displays an error and preserves chat state for a retry. Previously authorized responses remain in DevTools history; a newly unauthorized API request returns 401 with an error only.

## Verification

~~~sh
npm run verify:auth
npm run verify:security
~~~

Run the configured app on port 3100, or use AUTH_TEST_URL / SECURITY_TEST_URL overrides. Checks cover customer/admin navigation, endpoint guards, active-session revocation, ownership, and mutation protection. Browser checks cover all three logins, profile/menu navigation, and logout. Email delivery and physical-device accessibility still need independent checks. Configure a trusted NODE_EXTRA_CA_CERTS bundle if the local network requires one; keep TLS verification enabled.
