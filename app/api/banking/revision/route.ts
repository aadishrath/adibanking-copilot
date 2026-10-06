import { withActivity } from '@/lib/activity-api';
import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth/session';
import { ApiError, apiFailure } from '@/lib/api/errors';
import { readBankingRevision } from '@/lib/banking-revision';

async function handleGET() {
  try {
    if (!await getViewer()) throw new ApiError(401, 'Sign in to refresh banking data.');
    return NextResponse.json({ revision: await readBankingRevision() }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return apiFailure(error); }
}

export const GET = withActivity(handleGET);
