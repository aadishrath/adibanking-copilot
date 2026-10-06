import { withActivity } from '@/lib/activity-api';
import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth/session';
import { ApiError,apiFailure } from '@/lib/api/errors';
import { readAnalytics } from '@/lib/analytics';
import { readBankingRevision } from '@/lib/banking-revision';
async function handleGET(request:Request){try{if(!await getViewer())throw new ApiError(401,'Sign in to view analytics.');const revision=await readBankingRevision();return NextResponse.json(await readAnalytics(request),{headers:{'Cache-Control':'private, no-store','X-Banking-Revision':revision}});}catch(error){return apiFailure(error);}}

export const GET = withActivity(handleGET);
