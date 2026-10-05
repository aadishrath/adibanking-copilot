import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const demoIdentities = {
  'admin@adibank.example': { name: 'AdiBank Admin', role: 'admin' },
  'maya@adibank.example': { name: 'Maya Patel', role: 'customer' },
  'alex@adibank.example': { name: 'Alex Morgan', role: 'customer' },
} as const;

// These credentials are intentionally public only when the demo is enabled.
export async function getDemoAccounts() {
  if (process.env.DEMO_LOGIN_ENABLED !== 'true') return [];
  try {
    const raw = process.env.DEMO_LOGIN_ACCOUNTS || await readFile(join(process.cwd(), '.env.demo-users.json'), 'utf8');
    const records: unknown = JSON.parse(raw);
    if (!Array.isArray(records)) return [];
    return Object.entries(demoIdentities).flatMap(([email, identity]) => {
      const record = records.find(item => item && item.email === email && item.role === identity.role);
      if (!record || typeof record.password !== 'string' || !record.password || record.password.length > 128) return [];
      return [{ email, password: record.password, ...identity }];
    });
  } catch {
    return [];
  }
}
