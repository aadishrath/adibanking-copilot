import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/auth/session';
import { getSupabaseConfig } from '@/lib/supabase/config';
import LoginForm from '@/components/auth/LoginForm';
import { getDemoAccounts } from '@/lib/auth/demo-accounts';
export default async function LoginPage() {
  if (await getViewer()) redirect('/dashboard');
  return <div className="mx-auto grid min-h-[75vh] max-w-5xl items-center gap-12 py-10 md:grid-cols-2">
    <section className="order-2 md:order-1"><span className="inline-flex rounded-full bg-teal-50 px-3 py-1 text-sm font-medium text-teal-800">Welcome to AdiBank</span><h1 className="mt-5 text-4xl font-semibold tracking-tight text-slate-900 md:text-5xl">Your money.<br />A clearer picture.</h1><p className="mt-5 max-w-md text-lg leading-relaxed text-slate-600">Sign in to explore your accounts, review activity, and keep your profile up to date.</p><p className="mt-8 text-sm text-slate-500">Banking data is currently a demonstration. Sign-in and profile updates use Supabase.</p></section>
    <section className="order-1 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 md:order-2"><h2 className="text-2xl font-semibold text-slate-900">Sign in</h2><p className="mt-2 mb-7 text-sm text-slate-500">Use the email and password for your account.</p><LoginForm configured={Boolean(getSupabaseConfig())} demoAccounts={await getDemoAccounts()} /></section>
  </div>;
}
