import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseConfig } from '@/lib/supabase/config';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const config = getSupabaseConfig();
  const path = request.nextUrl.pathname;
  const protectedPage = /^\/(?:profile|dashboard|accounts|transactions|transfers|logs|admin)(?:\/|$)/.test(path);
  const protectedApi = path.startsWith('/api/');
  const deny = () => {
    const denied = protectedApi ? NextResponse.json({ error: 'Sign in to access this resource.' }, { status: 401 }) : NextResponse.redirect(new URL('/login', request.url));
    response.cookies.getAll().forEach(cookie => denied.cookies.set(cookie));
    denied.headers.set('Cache-Control', 'private, no-store');
    return denied;
  };
  if (!config) { response.headers.set('Cache-Control', 'private, no-store'); return protectedPage || protectedApi ? deny() : response; }
  const supabase = createServerClient(config.url, config.key, {
    cookieOptions: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });
  const { data, error } = await supabase.auth.getUser();
  if ((protectedPage || protectedApi) && (error || !data.user)) return deny();
  if ((path === '/admin' || path.startsWith('/admin/')) && data.user?.app_metadata.role !== 'admin') {
    const denied = NextResponse.redirect(new URL('/dashboard', request.url));
    response.cookies.getAll().forEach(cookie => denied.cookies.set(cookie));
    denied.headers.set('Cache-Control', 'private, no-store');
    return denied;
  }
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
export const config = { matcher: ['/', '/login', '/profile/:path*', '/dashboard/:path*', '/accounts/:path*', '/transactions/:path*', '/transfers/:path*', '/logs/:path*', '/admin/:path*', '/auth/:path*', '/api/:path*'] };
