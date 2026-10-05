import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseConfig } from '@/lib/supabase/config';
import { canAccess, getRole, type Feature, type Viewer } from './roles';

export const getCurrentUser = cache(async () => {
  if (!getSupabaseConfig()) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  if (process.env.BANKING_DATA_SOURCE === 'supabase') {
    const session = await supabase.rpc('has_active_banking_session');
    if (session.error || session.data !== true) return null;
  }
  return data.user;
});
export async function getViewer(): Promise<Viewer | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return { id: user.id, email: user.email ?? '', fullName: typeof user.user_metadata.full_name === 'string' ? user.user_metadata.full_name : 'Your account', role: getRole(user.app_metadata) };
}
export async function requireViewer(feature?: Feature) {
  const viewer = await getViewer();
  if (!viewer) redirect('/login');
  if (feature && !canAccess(viewer.role, feature)) redirect('/dashboard');
  return viewer;
}
