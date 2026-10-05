import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth/session';
import { z } from 'zod';
import { ApiError, apiFailure, readJson } from '@/lib/api/errors';
import { MAX_TRANSFER_CENTS } from '@/lib/money';
import { executeTransfer } from '@/lib/transfers';
const Transfer = z.object({ fromId: z.guid(), toId: z.guid(), amountCents: z.number().int().positive().max(MAX_TRANSFER_CENTS), idempotencyKey: z.guid() }).strict();
export async function POST(request: Request) {
  try {
    const viewer = await getViewer();
    if (!viewer) throw new ApiError(401, 'Sign in to transfer funds.');
    const body = await readJson(request, Transfer);
    return NextResponse.json(await executeTransfer(viewer.id,body), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return apiFailure(error); }
}
