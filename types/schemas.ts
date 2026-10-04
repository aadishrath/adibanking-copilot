
import { z } from 'zod';
import { CURRENCIES } from './account.ts';

export const CurrencyEnum = z.enum(CURRENCIES as unknown as [string, ...string[]]);

export const AccountRowSchema = z.object({
  id: z.string().uuid().or(z.string()), // allow non-uuid for mock/dev
  name: z.string().min(1),
  balanceCents: z.number().int(),
  currency: CurrencyEnum,
  created_at: z.string().optional(),
  user_id: z.string().nullable().optional(),
});

export const AccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  balance: z.number(),
  currency: CurrencyEnum,
  createdAt: z.string().optional(),
  userId: z.string().optional(),
});

export const TransactionRowSchema = z.object({
  id: z.string(),
  account_id: z.string(),
  amount_cents: z.number().int(),
  description: z.string().nullable().optional(),
  created_at: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const TransactionSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  amount: z.number(),
  description: z.string().optional(),
  createdAt: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type AccountRow = z.infer<typeof AccountRowSchema>;
export type Account = z.infer<typeof AccountSchema>;
export type TransactionRow = z.infer<typeof TransactionRowSchema>;
export type Transaction = z.infer<typeof TransactionSchema>;
