# Deployment checks

Public live version: [adibanking-copilot.vercel.app](https://adibanking-copilot.vercel.app/). The URL was provided by the project owner; parity with the current local implementation has not been verified. These local changes have not been published during this work.

The repository now declares Node 22 in package.json, .nvmrc and .node-version. Use `npm ci`, `npm run build`, and `npm start` on a Node host, or configure a Next.js host to use the same Node version and build command.

Set the public Supabase URL/key, private service-role key (administrator directory only), app origin, optional OpenAI key/model, and explicit BANKING_DATA_SOURCE in the host's environment. Do not upload .env.local or .env.demo-users.json. Add the deployed /auth/callback URL to Supabase's allowed redirects and set NEXT_PUBLIC_APP_URL to the deployed origin.

Keep BANKING_DATA_SOURCE=demo until the banking migration, seed, and hosted RLS checks pass. A database failure in supabase mode returns an error rather than silently serving fixtures.

GitHub Actions checks installation, lint, type checking, unit tests, PostgreSQL migration tests, and the production build on Node 22. This is CI validation; it does not deploy the application.

The production build is locally verified. Repairing the existing hosted deployment remains pending the hosting provider, site URL, and failing build/deployment log. No hosting settings have been changed and no site has been published during this chunk.
