import { requireViewer, getCurrentUser } from '@/lib/auth/session';
import ProfileForm from '@/components/auth/ProfileForm';
import { ROLE_LABELS } from '@/lib/auth/roles';
export default async function ProfilePage() {
  const viewer = await requireViewer();
  const user = await getCurrentUser();
  const metadata = user?.user_metadata ?? {};
  const text = (key: string) => typeof metadata[key] === 'string' ? metadata[key] : '';
  return <div className="mx-auto max-w-3xl py-6"><h1 className="text-3xl font-semibold tracking-tight">Your profile</h1><p className="mt-2 text-slate-500">Manage your personal details and contact information.</p>
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><div className="mb-7 flex items-center gap-4 border-b border-slate-100 pb-6"><span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-teal-50 text-xl font-semibold text-teal-800">{viewer.fullName.charAt(0).toUpperCase()}</span><div className="min-w-0"><h2 className="break-words font-semibold">{viewer.fullName}</h2><span className="text-sm text-teal-700">{ROLE_LABELS[viewer.role]}</span></div></div>
      <ProfileForm profile={{ fullName: viewer.fullName, email: viewer.email, phone: text('contact_phone'), city: text('city'), country: text('country') }} /><p className="mt-6 text-xs text-slate-500">Your access role is managed by an administrator.</p>
    </section></div>;
}
