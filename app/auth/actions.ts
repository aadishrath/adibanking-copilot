'use server';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';

export type FormState = { error?: string; message?: string };
const LoginSchema = z.object({ email: z.email().max(254), password: z.string().min(1).max(128) });
const ProfileSchema = z.object({ fullName: z.string().trim().min(2, 'Name must contain at least 2 characters.').max(100), email: z.email('Enter a valid email address.').max(254), phone: z.string().trim().max(30), city: z.string().trim().max(80), country: z.string().trim().max(80) });

export async function login(_state: FormState, form: FormData): Promise<FormState> {
  const parsed = LoginSchema.safeParse({ email: String(form.get('email') ?? '').trim(), password: form.get('password') });
  if (!parsed.success) return { error: 'Enter a valid email address and password.' };
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) return { error: 'Unable to sign in. Check your email and password and try again.' };
  } catch { return { error: 'Sign-in is unavailable. Check the Supabase connection and try again.' }; }
  revalidatePath('/', 'layout');
  redirect('/dashboard');
}
export async function logout(): Promise<FormState> {
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) return { error: 'Unable to end your session. Please try again.' };
  } catch { return { error: 'Unable to end your session. Please try again.' }; }
  revalidatePath('/', 'layout');
  redirect('/login');
}
export async function updateProfile(_state: FormState, form: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const parsed = ProfileSchema.safeParse(Object.fromEntries(['fullName', 'email', 'phone', 'city', 'country'].map(key => [key, form.get(key)])));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { fullName, email, phone, city, country } = parsed.data;
  const emailChanged = email.toLowerCase() !== user.email?.toLowerCase();
  try {
    const supabase = await createSupabaseServerClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const { error } = await supabase.auth.updateUser({ data: { full_name: fullName, contact_phone: phone, city, country }, ...(emailChanged ? { email } : {}) }, { emailRedirectTo: new URL('/auth/callback', appUrl).toString() });
    if (error) return { error: 'Unable to save your profile. Please try again.' };
  } catch { return { error: 'Profile updates are unavailable. Please try again.' }; }
  revalidatePath('/', 'layout');
  return { message: emailChanged ? 'Profile saved. Confirm the email change using the links Supabase sends to your inbox.' : 'Your profile has been saved.' };
}
