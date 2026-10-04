import { AccountRow, Account } from '../types/account.ts';

/**
 * Convert integer cents (DB) to UI dollars number.
 * Keeps two decimal places.
 */
export function centsToDollars(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

/**
 * Convert UI dollars to integer cents for storage.
 * Rounds to nearest cent.
 */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * Map a DB row to a UI Account.
 * Validates shape lightly (no runtime schema dependency here).
 */
export function rowToAccount(row: AccountRow): Account {
  return {
    id: row.id,
    name: row.name,
    balance: centsToDollars(row.balanceCents),
    currency: row.currency,
    createdAt: row.created_at,
    userId: row.user_id ?? undefined,
  };
}

/**
 * Map a UI Account to a DB row shape (useful for inserts/updates).
 * Note: id and created_at handling may be done by DB.
 */
export function accountToRow(a: Account): AccountRow {
  return {
    id: a.id,
    name: a.name,
    balanceCents: dollarsToCents(a.balance),
    currency: a.currency,
    created_at: a.createdAt ?? new Date().toISOString(),
    user_id: a.userId ?? null,
  };
}

/**
 * Format a number for display with currency symbol.
 * Uses Intl.NumberFormat for correct localization.
 */
export function formatCurrency(value: number, currency: string, locale = 'en-US') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
}
