
export type Transaction = {
  id: string;
  accountId: string;
  amount: number; // dollars for UI (positive for credit, negative for debit)
  amountCents?: number;
  currency?: string;
  category?: string;
  transferId?: string | null;
  description?: string;
  createdAt: string; // ISO timestamp
  metadata?: Record<string, unknown>;
};

export type TransactionRow = {
  id: string;
  account_id: string;
  amount_cents: number; // integer cents
  description?: string | null;
  created_at: string; // ISO timestamp
  metadata?: Record<string, unknown> | null;
};
