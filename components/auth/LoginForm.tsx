'use client';
import { useActionState, useState } from 'react';
import { login, type FormState } from '@/app/auth/actions';
type DemoAccount = { name: string; email: string; password: string; role: string };
export default function LoginForm({ configured, demoAccounts = [] }: { configured: boolean; demoAccounts?: DemoAccount[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(login, {});
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [demoEmail, setDemoEmail] = useState('');
  const selectedDemo = demoAccounts.find(account => account.email === demoEmail);
  return <form action={action} className="space-y-5">
    {demoAccounts.length > 0 && <div className="rounded-xl border border-teal-200 bg-teal-50 p-4">
      <label htmlFor="demo-account" className="field-label text-teal-900">Try a demo account</label>
      <p id="demo-account-help" className="mb-3 text-sm text-teal-800">Choose an admin or customer account to fill in the sign-in details.</p>
      <select id="demo-account" className="field-input bg-white" value={demoEmail} disabled={pending || !configured} aria-describedby="demo-account-help" onChange={event => {
        const account = demoAccounts.find(item => item.email === event.target.value);
        setDemoEmail(event.target.value);
        setEmail(account?.email ?? '');
        setPassword(account?.password ?? '');
      }}>
        <option value="">Select a demo account</option>
        {demoAccounts.map(account => <option key={account.email} value={account.email}>{account.name} ({account.role})</option>)}
      </select>
      {selectedDemo && <dl className="mt-3 space-y-2 text-sm text-teal-950" aria-live="polite">
        <div><dt className="font-semibold">Email</dt><dd className="break-all select-all">{selectedDemo.email}</dd></div>
        <div><dt className="font-semibold">Password</dt><dd className="break-all font-mono select-all">{selectedDemo.password}</dd></div>
      </dl>}
      <p className="mt-3 text-xs text-teal-800">Public demo accounts share sample data. Changes may be visible to other visitors.</p>
    </div>}
    <div><label htmlFor="email" className="field-label">Email address</label><input id="email" name="email" type="email" autoComplete="username" required maxLength={254} className="field-input" placeholder="you@example.com" value={email} onChange={event => setEmail(event.target.value)} disabled={pending} /></div>
    <div><label htmlFor="password" className="field-label">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required maxLength={128} className="field-input" value={password} onChange={event => setPassword(event.target.value)} disabled={pending} /></div>
    {!configured && <p role="alert" className="text-sm text-red-700">Sign-in needs the Supabase project URL and public key configured on the server.</p>}
    {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
    <button type="submit" disabled={pending || !configured} className="primary-button w-full">{pending ? 'Signing in…' : 'Sign in'}</button>
  </form>;
}
