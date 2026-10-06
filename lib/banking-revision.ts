import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ApiError } from '@/lib/api/errors';

export async function readBankingRevision() {
  const mode = process.env.BANKING_DATA_SOURCE ?? 'demo';
  if (mode === 'demo') return 'demo-v1';
  if (mode !== 'supabase') throw new ApiError(503, 'Banking configuration is invalid.');
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc('get_banking_revision');
  if (error || typeof data !== 'string') throw new ApiError(503, 'Banking refresh is unavailable. Check the database revision migration.');
  return data;
}
