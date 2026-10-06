import { z } from 'zod';
export const logRowSchema = z.object({ id:z.guid(),actor_id:z.guid(),actor_name:z.string(),actor_email:z.string(),interaction_type:z.string(),details:z.record(z.string(),z.unknown()),created_at:z.string() });
export const logsSchema = z.object({ rows:z.array(logRowSchema),total:z.number().int().nonnegative(),page:z.number().int().positive(),pageSize:z.number().int().positive(),asOf:z.string(),users:z.array(z.object({id:z.guid(),name:z.string(),email:z.string()})) });
export type LogsData = z.infer<typeof logsSchema>;
