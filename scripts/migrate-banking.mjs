import { readFile } from 'node:fs/promises';
import pg from 'pg';

// Schema changes use a server-only PostgreSQL connection; never use the public key.
async function main() {
  if (!process.env.DATABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error('Set DATABASE_URL and NEXT_PUBLIC_SUPABASE_URL in .env.local.');
  }
  const connection = new URL(process.env.DATABASE_URL);
  const project = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
  const direct = connection.hostname === `db.${project}.supabase.co`;
  const pooler = connection.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(connection.username) === `postgres.${project}`;
  if (!['postgres:', 'postgresql:'].includes(connection.protocol) || (!direct && !pooler)) {
    throw new Error('DATABASE_URL must point to the configured Supabase project using its direct or Session pooler connection.');
  }
  if (pooler && connection.port && connection.port !== '5432') {
    throw new Error('Use the Session pooler on port 5432 for migrations.');
  }
  // URL SSL parameters override pg's ssl object. Always retain certificate and
  // hostname verification, with an optional downloaded Supabase root CA.
  const certificatePath = process.env.DATABASE_CA_CERT_PATH || connection.searchParams.get('sslrootcert') || new URL('../supabase/database-ca.crt', import.meta.url);
  for (const parameter of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'ssl', 'uselibpqcompat']) connection.searchParams.delete(parameter);
  const ca = certificatePath ? await readFile(certificatePath, 'utf8') : undefined;
  const client = new pg.Client({
    connectionString: connection.toString(),
    ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
    connectionTimeoutMillis: 10_000,
    statement_timeout: 60_000,
    application_name: 'adibank-banking-migration',
  });
  try {
    await client.connect();
    await client.query("set lock_timeout = '10s'");
    if (!process.argv.includes('--seed-only')) {
      const migration = process.argv.find(value => value.startsWith('--migration='))?.slice('--migration='.length) ?? '202610040001_banking.sql';
      if (!/^\d{12}_[a-z_]+\.sql$/.test(migration)) throw new Error('Invalid migration filename.');
      await client.query(await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), 'utf8'));
      console.log(`Banking migration committed: ${migration}.`);
    }
    if (!process.argv.includes('--schema-only')) {
    await client.query(await readFile(new URL('../supabase/seed.sql', import.meta.url), 'utf8'));
    if (process.argv.includes('--activity')) await client.query(await readFile(new URL('../supabase/demo-activity.sql', import.meta.url), 'utf8'));
    if (process.argv.includes('--analytics-activity')) await client.query(await readFile(new URL('../supabase/demo-analytics-activity.sql', import.meta.url), 'utf8'));
    if (process.argv.includes('--credit-activity')) await client.query(await readFile(new URL('../supabase/demo-credit-activity.sql', import.meta.url), 'utf8'));
    console.log('Demo banking seed committed. Run verify:banking before changing the data mode.');
    }
    await client.query("notify pgrst, 'reload schema'");
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch(error => {
  // Do not log connection strings, raw SQL, PostgreSQL detail, or credentials.
  const safeMessages = [
    'Set DATABASE_URL and NEXT_PUBLIC_SUPABASE_URL in .env.local.',
    'DATABASE_URL must point to the configured Supabase project using its direct or Session pooler connection.',
    'Use the Session pooler on port 5432 for migrations.',
    'Banking tables already exist or are partially migrated. Review the schema before applying this migration.',
    'Unrecognized accounts schema. A reviewed data migration is required.',
    'Unrecognized transactions schema. A reviewed data migration is required.',
    'Legacy banking tables contain data. Refusing to archive them; a reviewed data migration is required.',
    'Legacy tables have external dependencies or custom triggers. Review them before migrating.',
    'banking_legacy already exists. Review migration history before proceeding.',
  ];
  if (safeMessages.includes(error.message)) console.error(error.message);
  else if (['EACCES', 'ENETUNREACH', 'EHOSTUNREACH', 'ETIMEDOUT', 'ENOTFOUND'].includes(error.code)) console.error('Database endpoint is unreachable. Check the Session pooler connection and local network access.');
  else if (error.code === '28P01') console.error('Database authentication rejected (28P01). Check credentials and run db:diagnose; after a password reset the shared pooler can temporarily retain old credentials.');
  else if (['SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'DEPTH_ZERO_SELF_SIGNED_CERT'].includes(error.code)) console.error('Database certificate verification failed. Set DATABASE_CA_CERT_PATH to the Supabase root certificate.');
  else console.error('Migration or seed failed. Review the database state before retrying; no automatic data-mode switch was performed.');
  process.exitCode = 1;
});
