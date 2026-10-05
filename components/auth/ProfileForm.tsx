'use client';
import { useActionState, useState } from 'react';
import { updateProfile, type FormState } from '@/app/auth/actions';
type Profile = { fullName: string; email: string; phone: string; city: string; country: string };
export default function ProfileForm({ profile }: { profile: Profile }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateProfile, {});
  const [values, setValues] = useState(profile);
  const fields = [
    { name: 'fullName', label: 'Full name', type: 'text', autoComplete: 'name', maxLength: 100, required: true },
    { name: 'email', label: 'Email address', type: 'email', autoComplete: 'email', maxLength: 254, required: true },
    { name: 'phone', label: 'Contact phone', type: 'tel', autoComplete: 'tel', maxLength: 30 },
    { name: 'city', label: 'City', type: 'text', autoComplete: 'address-level2', maxLength: 80 },
    { name: 'country', label: 'Country', type: 'text', autoComplete: 'country-name', maxLength: 80 },
  ] as const;
  return <form action={action} className="space-y-5"><div className="grid gap-5 sm:grid-cols-2">{fields.map(field => <div key={field.name} className={field.name === 'fullName' ? 'sm:col-span-2' : ''}><label htmlFor={field.name} className="field-label">{field.label}</label><input id={field.name} name={field.name} type={field.type} autoComplete={field.autoComplete} maxLength={field.maxLength} required={'required' in field && field.required} value={values[field.name]} onChange={event => setValues(previous => ({ ...previous, [field.name]: event.target.value }))} disabled={pending} className="field-input" /></div>)}</div><p className="text-xs text-slate-500">Changing your sign-in email requires email confirmation.</p>{state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}{state.message && <p role="status" className="text-sm text-teal-700">{state.message}</p>}<button type="submit" disabled={pending} className="primary-button">{pending ? 'Saving…' : 'Save changes'}</button></form>;
}
