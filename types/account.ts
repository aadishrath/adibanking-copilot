
export const CURRENCIES = ['USD', 'EUR', 'GBP'] as const;
export type Currency = (typeof CURRENCIES)[number];
export const ACCOUNT_TYPES = ['checking','savings','retirement','investment','mortgage','loan','credit_card'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];
export const ACCOUNT_TYPE_LABELS: Record<AccountType,string> = {checking:'Checking',savings:'Savings',retirement:'Retirement',investment:'Investment',mortgage:'Mortgage',loan:'Loan',credit_card:'Credit Card'};
export const isDebtAccount = (type?: string) => ['credit_card','mortgage','loan'].includes(type ?? '');

/**
 * UI-friendly account model used across React components.
 * - `balance` is a display number (dollars) derived from balanceCents.
 * - Prefer doing arithmetic on cents (integers) in server/DB code.
 */
export type Account = {
  id: string;
  name: string;
  balance: number; // dollars (e.g., 1234.56) — for display only
  balanceCents?: number;
  currency: Currency;
  createdAt?: string; // ISO timestamp
  userId?: string;
  accountType?: AccountType;
  creditLimitCents?: number | null;
  status?: 'active' | 'frozen' | 'closed';
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

export const canFundTransfer = (type?: string) => !['mortgage', 'loan'].includes(type ?? '');
export const transferableCents = (account: Account) => account.accountType === 'credit_card'
  ? Math.max(0, (account.creditLimitCents ?? 0) - (account.balanceCents ?? Math.round(account.balance * 100)))
  : account.balanceCents ?? Math.round(account.balance * 100);
