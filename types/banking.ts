import type { Account } from './account';
import type { Transaction } from './transaction';
export type Transfer = { id: string; from_account_id: string; to_account_id: string; amount_cents: number; currency: string; created_at: string; deleted_at: string | null };
export type BankingSnapshot = { accounts: Account[]; transactions: Transaction[]; transfers: Transfer[]; source: 'demo' | 'supabase' };
export type RecordKind = 'accounts' | 'transactions' | 'transfers';
