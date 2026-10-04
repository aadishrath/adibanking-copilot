import { AccountRow, TransactionRow } from '../types/schemas.ts';
import { rowToAccount } from './account-utils.ts';
import { rowToTransaction } from './transaction-utils.ts';

/**
 * Load mock JSON files and convert to UI models.
 * These functions are safe for local dev and demo.
 */

export async function loadMockAccounts(): Promise<ReturnType<typeof rowToAccount>[]> {
  const res = await fetch('/mock-data/accounts.json');
  const rows: AccountRow[] = await res.json();
  return rows.map(r => rowToAccount(r as any));
}

export async function loadMockTransactions(): Promise<ReturnType<typeof rowToTransaction>[]> {
  const res = await fetch('/mock-data/transactions.json');
  const rows: TransactionRow[] = await res.json();
  return rows.map(r => rowToTransaction(r as any));
}
