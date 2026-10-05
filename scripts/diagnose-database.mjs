import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import pg from 'pg';

// Credential-safe, read-only diagnostics. Never log URLs, passwords or raw errors.
async function main() {
  const saved = parseEnv(await readFile(new URL('../.env.local', import.meta.url), 'utf8'));
  const value = process.env.DATABASE_URL ?? saved.DATABASE_URL;
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? saved.NEXT_PUBLIC_SUPABASE_URL;
  if (!value || !projectUrl) throw new Error('configuration');
  const uri = new URL(value);
  const project = new URL(projectUrl).hostname.split('.')[0];
  const pooler = uri.hostname.endsWith('.pooler.supabase.com');
  if ((!pooler && uri.hostname !== `db.${project}.supabase.co`) || !['postgres:', 'postgresql:'].includes(uri.protocol)) throw new Error('configuration');
  const parameters = new pg.Client({ connectionString: uri.toString() }).connectionParameters;
  console.log(JSON.stringify({
    check: 'configuration',
    environmentOverridesFile: Boolean(process.env.DATABASE_URL && value !== saved.DATABASE_URL),
    usernameMatchesProject: decodeURIComponent(uri.username) === (pooler ? `postgres.${project}` : 'postgres'),
    driverPreservesPassword: parameters.password === decodeURIComponent(uri.password),
    queryOverrides: [...uri.searchParams.keys()].filter(key => ['user', 'password', 'host', 'port', 'database'].includes(key)),
  }));
  const certificatePath = process.env.DATABASE_CA_CERT_PATH || saved.DATABASE_CA_CERT_PATH || uri.searchParams.get('sslrootcert') || new URL('../supabase/database-ca.crt', import.meta.url);
  const ca = await readFile(certificatePath, 'utf8');
  const configuration = {
    host: uri.hostname, port: Number(uri.port || 5432),
    user: decodeURIComponent(uri.username), password: decodeURIComponent(uri.password),
    database: decodeURIComponent(uri.pathname.slice(1)),
    ssl: { ca, rejectUnauthorized: true }, connectionTimeoutMillis: 10_000,
    statement_timeout: 10_000, application_name: 'adibank-readonly-diagnostic',
  };
  const targets = [{ name: pooler ? 'shared-pooler' : 'direct', config: configuration }];
  if (pooler) targets.push({ name: 'direct-bypass-pooler', config: { ...configuration, host: `db.${project}.supabase.co`, port: 5432, user: 'postgres' } });
  let successes = 0;
  for (const target of targets) {
    const client = new pg.Client(target.config);
    try {
      await client.connect();
      await client.query('select 1');
      successes++;
      console.log(JSON.stringify({ endpoint: target.name, connected: true, verifiedTls: true, readOnlyQuery: true }));
    } catch (error) {
      const category = /circuit breaker/i.test(error.message) ? 'pooler-circuit-breaker'
        : /tenant or user not found/i.test(error.message) ? 'pooler-tenant-routing'
        : error.code === '28P01' ? 'server-rejected-authentication'
        : ['EACCES', 'ENETUNREACH', 'EHOSTUNREACH', 'ETIMEDOUT', 'ENOTFOUND'].includes(error.code) ? 'network-unreachable'
        : ['SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'DEPTH_ZERO_SELF_SIGNED_CERT'].includes(error.code) ? 'certificate-verification'
        : 'connection-failure';
      console.log(JSON.stringify({ endpoint: target.name, connected: false, code: error.code ?? null, category }));
    } finally { await client.end().catch(() => {}); }
  }
  if (!successes) process.exitCode = 1;
}

main().catch(() => {
  console.error('Could not diagnose the connection. Check the local configuration and trusted CA file. Credentials were not logged.');
  process.exitCode = 1;
});
