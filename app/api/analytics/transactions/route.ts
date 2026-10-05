import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth/session';
import { ApiError,apiFailure } from '@/lib/api/errors';
import { readAnalytics } from '@/lib/analytics';
export async function GET(request:Request){try{
  if(!await getViewer())throw new ApiError(401,'Sign in to view transactions.');
  const category=new URL(request.url).searchParams.get('category');
  if(!category||category.length>50)throw new ApiError(400,'Choose an expense category.');
  return NextResponse.json(await readAnalytics(request,category),{headers:{'Cache-Control':'private, no-store'}});
}catch(error){return apiFailure(error);}}
