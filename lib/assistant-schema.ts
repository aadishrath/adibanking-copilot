import { z } from 'zod';
import { MAX_TRANSFER_CENTS } from '@/lib/money';
export const transferProposalSchema = z.object({
  token: z.string().min(1).max(4096), fromName: z.string(), toName: z.string(),
  fromId: z.guid(), toId: z.guid(), amountCents: z.number().int().positive().max(MAX_TRANSFER_CENTS),
  currency: z.enum(['USD', 'EUR', 'GBP']), expiresAt: z.number().int(),
});
export const assistantResponseSchema = z.object({ assistant: z.string().min(1).max(8000), proposal: transferProposalSchema.optional() });
export type TransferProposal = z.infer<typeof transferProposalSchema>;
