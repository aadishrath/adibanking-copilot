import 'server-only';
import { createClient } from '@supabase/supabase-js';

// Auth/UI/request logging must not turn a completed action into an apparent failure.
// Banking completion logs are separately guaranteed by transactional database triggers.
export async function recordActivity(actorId: string, type: string, details: Record<string, unknown>) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Activity configuration unavailable');
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(5000) }) } });
    const { error } = await client.rpc('record_activity', { p_actor: actorId, p_type: type, p_details: details });
    if (error) throw new Error('Activity write failed');
    return true;
  } catch {
    console.error('activity_write_failed', { type });
    return false;
  }
}
