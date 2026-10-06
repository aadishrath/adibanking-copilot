import 'server-only';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ApiError } from '@/lib/api/errors';
import demoAccounts from '@/lib/fixtures/accounts.json';
import demoTransactions from '@/lib/fixtures/transactions.json';
import { ACCOUNT_TYPES, type Account } from '@/types/account';
import type { Transaction } from '@/types/transaction';
import type { BankingSnapshot } from '@/types/banking';
import { readBankingRevision } from '@/lib/banking-revision';

export function usesPersistentBanking() {
  const mode = process.env.BANKING_DATA_SOURCE ?? 'demo';
  if (mode !== 'demo' && mode !== 'supabase') throw new ApiError(503, 'Banking configuration is invalid.');
  return mode === 'supabase';
}
const Currency = z.enum(['USD', 'EUR', 'GBP']);
const AccountRow = z.object({ id: z.guid(), name: z.string(), account_type: z.enum(ACCOUNT_TYPES),status: z.enum(['active','frozen','closed']), currency: Currency, balance_cents: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), created_at: z.string(), credit_limit_cents:z.number().int().positive().max(100000000).nullable() });
const TransactionRow = z.object({ id: z.guid(), account_id: z.guid(), transfer_id: z.guid().nullable(), amount_cents: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER), currency: Currency, description: z.string(), created_at: z.string(), category: z.string() });
const TransferRow = z.object({id:z.guid(),from_account_id:z.guid(),to_account_id:z.guid(),amount_cents:z.number().int().positive().max(100000000),currency:Currency,created_at:z.string(),deleted_at:z.string().nullable()});

export async function getBankingSnapshot(userId: string): Promise<BankingSnapshot> {
  if (!usesPersistentBanking()) return { accounts: demoAccounts as Account[], transactions: [...demoTransactions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) as Transaction[], transfers: [], source: 'demo' as const, revision: 'demo-v1' };
  // Read before rows: a concurrent change must never label older rows with a newer token.
  const revision = await readBankingRevision();
  const supabase = await createSupabaseServerClient();
  const [accounts, transactions, transfers] = await Promise.all([
    supabase.from('accounts').select('id,name,account_type,status,currency,balance_cents,credit_limit_cents,created_at').eq('user_id', userId).order('created_at'),
    supabase.from('transactions').select('id,account_id,transfer_id,amount_cents,currency,description,created_at,category').eq('user_id', userId).order('created_at', { ascending: false }).order('id').limit(200),
    supabase.from('transfers').select('id,from_account_id,to_account_id,amount_cents,currency,created_at,deleted_at').eq('user_id',userId).order('created_at',{ascending:false}).limit(200),
  ]);
  if (accounts.error || transactions.error || transfers.error) throw new ApiError(503, 'Banking data is unavailable. Check that the database migration has been applied.');
  return {
    accounts: AccountRow.array().parse(accounts.data).map(row => ({ id: row.id, name: row.name, accountType:row.account_type,creditLimitCents:row.credit_limit_cents,status:row.status,currency: row.currency, balance: row.balance_cents / 100, balanceCents: row.balance_cents, createdAt: row.created_at })),
    transactions: TransactionRow.array().parse(transactions.data).map(row => ({ id: row.id, accountId: row.account_id, transferId:row.transfer_id,amount: row.amount_cents / 100, amountCents: row.amount_cents, currency: row.currency, description: row.description, createdAt: row.created_at, category: row.category })),
    transfers: TransferRow.array().parse(transfers.data),
    source: 'supabase' as const,
    revision,
  };
}
