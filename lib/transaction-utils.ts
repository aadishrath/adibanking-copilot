import { TransactionRow, Transaction } from '../types/transaction.ts';

/** Convert cents to dollars for a transaction */
export function txCentsToDollars(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

/** Convert dollars to cents for a transaction */
export function txDollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/** Map DB row to UI transaction */
export function rowToTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    accountId: row.account_id,
    amount: txCentsToDollars(row.amount_cents),
    description: row.description ?? undefined,
    createdAt: row.created_at,
    metadata: row.metadata ?? undefined,
  };
}

/** Map UI transaction to DB row */
export function transactionToRow(tx: Transaction): TransactionRow {
  return {
    id: tx.id,
    account_id: tx.accountId,
    amount_cents: txDollarsToCents(tx.amount),
    description: tx.description ?? null,
    created_at: tx.createdAt ?? new Date().toISOString(),
    metadata: tx.metadata ?? null,
  };
}

/** Sum transactions for an account (returns dollars) */
export function sumTransactionsForAccount(transactions: Transaction[], accountId: string): number {
  return transactions
    .filter(t => t.accountId === accountId)
    .reduce((acc, t) => acc + t.amount, 0);
}
