
export const CURRENCIES = ['USD', 'EUR', 'GBP'] as const;
export type Currency = (typeof CURRENCIES)[number];

/**
 * UI-friendly account model used across React components.
 * - `balance` is a display number (dollars) derived from balanceCents.
 * - Prefer doing arithmetic on cents (integers) in server/DB code.
 */
export type Account = {
  id: string;
  name: string;
  balance: number; // dollars (e.g., 1234.56) — for display only
  currency: Currency;
  createdAt?: string; // ISO timestamp
  userId?: string;
};

/**
 * DB/storage model (safe for money math).
 * - balanceCents is an integer (cents) to avoid floating point errors.
 * - column names follow typical Postgres/Supabase conventions.
 */
export type AccountRow = {
  id: string;
  name: string;
  balanceCents: number; // integer cents
  currency: Currency;
  created_at: string; // ISO timestamp
  user_id?: string | null;
};
