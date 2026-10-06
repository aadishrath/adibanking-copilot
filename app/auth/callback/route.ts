import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { recordActivity } from '@/lib/activity';
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (code) {
    const supabase = await createSupabaseServerClient();
    const { data,error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error){if(data.user)await recordActivity(data.user.id,'auth.confirmed',{summary:'Completed the email authentication callback.'});return NextResponse.redirect(new URL('/profile', request.url));}
  }
  return NextResponse.redirect(new URL('/login?confirmation=failed', request.url));
}
