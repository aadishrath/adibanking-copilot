import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth/session';
import { getBankingSnapshot } from '@/lib/banking';
import { ApiError, apiFailure } from '@/lib/api/errors';

export async function GET() {
  try {
    const viewer = await getViewer();
    if (!viewer) throw new ApiError(401, 'Sign in to view transactions.');
    const { transactions, source } = await getBankingSnapshot(viewer.id);
    return NextResponse.json({ transactions, source }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return apiFailure(error); }
}
