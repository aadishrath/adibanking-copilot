import 'server-only';
import { ApiError } from '@/lib/api/errors';
import { getBankingSnapshot, usesPersistentBanking } from '@/lib/banking';
import { createSupabaseServerClient } from '@/lib/supabase/server';
export async function executeTransfer(userId: string, body: { fromId: string; toId: string; amountCents: number; idempotencyKey: string }) {
  if (!usesPersistentBanking()) throw new ApiError(501, 'Transfers require persistent banking data. Your balances have not changed.');
  if (body.fromId === body.toId) throw new ApiError(400, 'Select two different accounts.');
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('transfer_funds', { p_from: body.fromId, p_to: body.toId, p_amount_cents: body.amountCents, p_idempotency_key: body.idempotencyKey });
  if (error) {
    if (error.code === '42501') throw new ApiError(403, 'One of the accounts is unavailable in your workspace.');
    if (error.code === '22023') throw new ApiError(400, 'Check your account status, currencies, available funds, and transfer details.');
    throw new ApiError(503, 'The banking backend could not confirm this transfer. Retry the same confirmation to check its status.');
  }
  const receipt = Array.isArray(data) ? data[0] : data;
  if (receipt?.deleted_at) throw new ApiError(409, 'This transfer has been reversed. Start a new transfer.');
  try { return { transfer: data, ...await getBankingSnapshot(userId) }; }
  catch { throw new ApiError(503, 'The transfer was recorded, but refreshed balances are unavailable. Retry the same confirmation to retrieve its receipt without transferring twice.'); }
}
