import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { MAX_TRANSFER_CENTS } from '@/lib/money';
const payloadSchema = z.object({ userId: z.guid(), fromId: z.guid(), toId: z.guid(), amountCents: z.number().int().positive().max(MAX_TRANSFER_CENTS), currency: z.enum(['USD', 'EUR', 'GBP']), idempotencyKey: z.guid(), expiresAt: z.number().int().positive() }).strict();
type TransferPayload = z.infer<typeof payloadSchema>;
const sign = (payload: string, secret: string) => createHmac('sha256', secret).update(payload).digest();
export function issueTransferToken(input: Omit<TransferPayload, 'idempotencyKey' | 'expiresAt'>, secret: string, now = Date.now()) {
  if (secret.length < 32) throw Error('Transfer confirmation is not configured.');
  const payload = payloadSchema.parse({ ...input, idempotencyKey: randomUUID(), expiresAt: now + 15 * 60_000 });
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { token: `${encoded}.${sign(encoded, secret).toString('base64url')}`, payload };
}
export function verifyTransferToken(token: string, userId: string, secret: string, now = Date.now()) {
  if (secret.length < 32) throw Error('Transfer confirmation is not configured.');
  const [encoded, signature, extra] = token.split('.');
  if (!encoded || !signature || extra) throw Error('Invalid transfer confirmation.');
  const received = Buffer.from(signature, 'base64url'), expected = sign(encoded, secret);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw Error('Invalid transfer confirmation.');
  const payload = payloadSchema.parse(JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')));
  if (payload.userId !== userId) throw Error('This transfer belongs to another session.');
  if (payload.expiresAt <= now) throw Error('This confirmation expired. Check transfer history before preparing another request.');
  return payload;
}
