import { createClient } from '@supabase/supabase-js';
import { readFile, writeFile } from 'node:fs/promises';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Set the Supabase URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.');
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const credentialPath = new URL('../.env.demo-users.json', import.meta.url);
let credentials = [];
try { credentials = JSON.parse(await readFile(credentialPath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const existing = [];
for (let page = 1; ; page++) {
  const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 });
  if (error) throw new Error(`Unable to list Supabase users (${error.code ?? error.status ?? 'connection failure'}).`);
  existing.push(...data.users);
  if (data.users.length < 100) break;
}
const users = [
  { email: 'admin@adibank.example', fullName: 'AdiBank Admin', role: 'admin', password: 'Admin!12' },
  { email: 'maya@adibank.example', fullName: 'Maya Patel', role: 'customer', password: 'Maya!123' },
  { email: 'alex@adibank.example', fullName: 'Alex Morgan', role: 'customer', password: 'Alex!123' },
];
for (const user of users) {
  const found = existing.find(item => item.email?.toLowerCase() === user.email);
  if (found && process.argv.includes('--reset-demo-passwords')) {
    const { error } = await client.auth.admin.updateUserById(found.id, { password: user.password });
    if (error) throw new Error(`Unable to reset demo password (${error.code ?? error.status ?? 'connection failure'}).`);
    credentials = credentials.filter(item => item.email !== user.email);
    credentials.push({ id: found.id, email: user.email, password: user.password, role: found.app_metadata?.role ?? user.role });
    await writeFile(credentialPath, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
    console.log(`Updated demo password: ${user.email}`);
    continue;
  }
  if (found) {
    console.log(`Preserved existing account: ${user.email}`);
    continue;
  }
  const password = user.password;
  const { data, error } = await client.auth.admin.createUser({ email: user.email, password, email_confirm: true, app_metadata: { role: user.role }, user_metadata: { full_name: user.fullName, contact_phone: '', city: '', country: '' } });
  if (error) throw new Error(`Unable to create ${user.email} (${error.code ?? error.status ?? 'connection failure'}).`);
  credentials.push({ id: data.user.id, email: user.email, password, role: user.role });
  await writeFile(credentialPath, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
  console.log(`Created ${user.role}: ${user.email}`);
}
console.log('Credentials are stored locally in .env.demo-users.json (ignored by Git).');
