import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth/session';
import { ApiError,apiFailure } from '@/lib/api/errors';
import { readAnalytics } from '@/lib/analytics';
export async function GET(request:Request){try{if(!await getViewer())throw new ApiError(401,'Sign in to view analytics.');return NextResponse.json(await readAnalytics(request),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return apiFailure(error);}}
