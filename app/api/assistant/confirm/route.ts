import { withActivity } from '@/lib/activity-api';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getViewer } from '@/lib/auth/session';
import { ApiError, apiFailure, readJson } from '@/lib/api/errors';
import { verifyTransferToken } from '@/lib/assistant-tokens';
import { executeTransfer } from '@/lib/transfers';
export const runtime = 'nodejs';
async function handlePOST(request: Request) {
  try {
    const viewer = await getViewer();
    if (!viewer) throw new ApiError(401, 'Your session is unavailable or expired. Sign in again, then check transfer history before retrying.');
    const body = await readJson(request, z.object({ token: z.string().min(1).max(4096), confirmed: z.literal(true) }).strict());
    const secret = process.env.CHAT_TRANSFER_SIGNING_SECRET ?? '';
    if (secret.length < 32) throw new ApiError(503, 'Chat transfer confirmation is not configured on the server. No transfer was submitted.');
    let payload;
    try { payload = verifyTransferToken(body.token, viewer.id, secret); }
    catch (error) { throw new ApiError(400, error instanceof Error && error.message.includes('expired') ? error.message : 'This transfer confirmation is invalid for your session. Prepare the transfer again.'); }
    const result = await executeTransfer(viewer.id, payload);
    const receipt = Array.isArray(result.transfer) ? result.transfer[0] : result.transfer;
    if (!receipt?.id) throw new ApiError(503, 'The backend did not return a transfer receipt. Retry the same confirmation to check its status.');
    const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency: payload.currency }).format(payload.amountCents / 100);
    return NextResponse.json({ assistant: `Sandbox transfer completed: ${amount}. Receipt: ${receipt.id}.`, receiptId: receipt.id }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return apiFailure(error); }
}

export const POST = withActivity(handlePOST);
