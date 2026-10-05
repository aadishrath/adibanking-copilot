import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseConfig } from './config';

export async function createSupabaseServerClient() {
  const config = getSupabaseConfig();
  if (!config) throw new Error('Supabase public configuration is missing.');
  const store = await cookies();
  return createServerClient(config.url, config.key, {
    cookieOptions: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' },
    cookies: {
      getAll: () => store.getAll(),
      setAll(cookiesToSet) {
        // Proxy refreshes sessions before rendering; components cannot write cookies.
        try { cookiesToSet.forEach(({ name, value, options }) => store.set(name, value, options)); }
        catch { /* Actions and route handlers can write cookies. */ }
      },
    },
  });
}
