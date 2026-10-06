import { withActivity } from '@/lib/activity-api';
import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth/session';
import { getBankingSnapshot } from '@/lib/banking';
import { ApiError,apiFailure } from '@/lib/api/errors';
async function handleGET(){try{const viewer=await getViewer();if(!viewer)throw new ApiError(401,'Sign in to view banking data.');return NextResponse.json(await getBankingSnapshot(viewer.id),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return apiFailure(error);}}

export const GET = withActivity(handleGET);
