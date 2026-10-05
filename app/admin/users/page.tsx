import { createClient } from '@supabase/supabase-js';
import { requireViewer } from '@/lib/auth/session';
import { getRole, ROLE_LABELS } from '@/lib/auth/roles';
export default async function UsersPage() {
  await requireViewer('manageUsers');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const admin = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  const result = admin ? await admin.auth.admin.listUsers({ page: 1, perPage: 100 }) : null;
  return <div className="space-y-6 py-6"><div><h1 className="text-3xl font-semibold tracking-tight">User directory</h1><p className="mt-2 text-slate-500">Administrator access · Up to 100 Supabase accounts</p></div>
    {!result || result.error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">The user directory is unavailable. Check the server’s Supabase admin configuration.</p> : <div role="region" aria-label="User directory table" tabIndex={0} className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th scope="col" className="p-4">Name</th><th scope="col" className="p-4">Email</th><th scope="col" className="p-4">Role</th><th scope="col" className="p-4">Created</th></tr></thead><tbody>{result.data.users.map(user => <tr key={user.id} className="border-t border-slate-100"><td className="p-4">{typeof user.user_metadata.full_name === 'string' ? user.user_metadata.full_name : '—'}</td><td className="p-4">{user.email}</td><td className="p-4"><span className="rounded-full bg-teal-50 px-2 py-1 text-xs text-teal-800">{ROLE_LABELS[getRole(user.app_metadata)]}</span></td><td className="p-4">{new Date(user.created_at).toLocaleDateString('en-US')}</td></tr>)}</tbody></table></div>}
  </div>;
}
