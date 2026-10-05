import { z } from 'zod';
const positiveCents=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const month=z.string().regex(/^\d{4}-\d{2}$/);
export const analyticsQuery=z.object({currency:z.enum(['USD','EUR','GBP']).default('USD'),timezone:z.string().min(1).max(100).default('America/Los_Angeles')});
export const analyticsSchema=z.object({currency:z.enum(['USD','EUR','GBP']),timezone:z.string(),month,
  months:z.array(z.object({month,incomeCents:positiveCents,expenseCents:positiveCents,savingsCents:z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER)})),
  categories:z.array(z.object({category:z.string(),expenseCents:positiveCents})),
});
export const categorySchema=z.object({month,currency:z.enum(['USD','EUR','GBP']),transactions:z.array(z.object({id:z.guid(),description:z.string(),amountCents:z.number().int().negative().min(-Number.MAX_SAFE_INTEGER),createdAt:z.string(),accountName:z.string()}))});
export type Analytics = z.infer<typeof analyticsSchema>;
export type CategoryDetail = z.infer<typeof categorySchema>;
