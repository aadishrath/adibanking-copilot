import { readFile } from 'node:fs/promises';
import pg from 'pg';

// Read database metadata only. Never print connection strings or customer rows.
let client;
try {
  const connection = new URL(process.env.DATABASE_URL);
  const project = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
  const pooler = connection.hostname.endsWith('.pooler.supabase.com');
  if (!['postgres:', 'postgresql:'].includes(connection.protocol) ||
      (pooler ? decodeURIComponent(connection.username) !== `postgres.${project}` : connection.hostname !== `db.${project}.supabase.co`)) throw new Error('configuration');
  const certificate = process.env.DATABASE_CA_CERT_PATH || connection.searchParams.get('sslrootcert') || new URL('../supabase/database-ca.crt', import.meta.url);
  for (const name of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'ssl', 'uselibpqcompat']) connection.searchParams.delete(name);
  client = new pg.Client({ connectionString: connection.toString(), ssl: { rejectUnauthorized: true, ca: await readFile(certificate, 'utf8') }, connectionTimeoutMillis: 10000, statement_timeout: 15000 });
  await client.connect();
  await client.query('begin read only');
  const tables = (await client.query(`
    select c.relname as table_name, c.relrowsecurity as rls_enabled,
      has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
      has_table_privilege('anon', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE') as anon_write,
      has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE') as authenticated_write
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p') order by c.relname
  `)).rows;
  const policies = (await client.query(`select tablename, policyname, roles, cmd, qual, with_check from pg_policies where schemaname='public' order by tablename,policyname`)).rows;
  const views = (await client.query(`select c.relname as view_name, c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('v','m')`)).rows;
  const functions = (await client.query(`select p.proname as function_name, has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute, p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef`)).rows;
  console.log(JSON.stringify({ tables, policies, views, securityDefinerFunctions: functions }, null, 2));
  await client.query('rollback');
  const issues = tables.filter(table => !table.rls_enabled || table.anon_select || table.anon_write || table.authenticated_write);
  if (issues.length) { console.error('Review table exposure: ' + issues.map(table => table.table_name).join(', ')); process.exitCode = 1; }
  else console.log('All public tables have RLS enabled; anonymous table access and direct authenticated writes are denied.');
} catch (error) {
  console.error('Read-only database audit failed. Check database configuration, connectivity and trusted TLS certificates. Code: ' + (error.code ?? 'configuration'));
  process.exitCode = 1;
} finally { await client?.end().catch(() => {}); }
