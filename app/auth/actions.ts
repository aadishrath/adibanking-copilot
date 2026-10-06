'use server';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { recordActivity } from '@/lib/activity';

export type FormState = { error?: string; message?: string };
const LoginSchema = z.object({ email: z.email().max(254), password: z.string().min(1).max(128) });
const ProfileSchema = z.object({ fullName: z.string().trim().min(2, 'Name must contain at least 2 characters.').max(100), email: z.email('Enter a valid email address.').max(254), phone: z.string().trim().max(30), city: z.string().trim().max(80), country: z.string().trim().max(80) });

export async function login(_state: FormState, form: FormData): Promise<FormState> {
  const parsed = LoginSchema.safeParse({ email: String(form.get('email') ?? '').trim(), password: form.get('password') });
  if (!parsed.success) return { error: 'Enter a valid email address and password.' };
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) return { error: 'Unable to sign in. Check your email and password and try again.' };
    if(data.user)await recordActivity(data.user.id,'login',{summary:'Signed in with email and password.'});
  } catch { return { error: 'Sign-in is unavailable. Check the Supabase connection and try again.' }; }
  revalidatePath('/', 'layout');
  redirect('/dashboard');
}
export async function logout(): Promise<{ success: true } | { error: string }> {
  try {
    const supabase = await createSupabaseServerClient();
    const user=await getCurrentUser();
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) return { error: 'Unable to end your session. Please try again.' };
    if(user)await recordActivity(user.id,'logout',{summary:'Ended the current session.'});
  } catch { return { error: 'Unable to end your session. Please try again.' }; }
  // The caller replaces the document after cookies are cleared, discarding the
  // previous user's client state instead of retaining it during a route transition.
  return { success: true };
}
export async function updateProfile(_state: FormState, form: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const parsed = ProfileSchema.safeParse(Object.fromEntries(['fullName', 'email', 'phone', 'city', 'country'].map(key => [key, form.get(key)])));
  if (!parsed.success){await recordActivity(user.id,'profile.update_failed',{summary:'Profile validation failed.'});return { error: parsed.error.issues[0].message };}
  const { fullName, email, phone, city, country } = parsed.data;
  const emailChanged = email.toLowerCase() !== user.email?.toLowerCase();
  try {
    const supabase = await createSupabaseServerClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const { error } = await supabase.auth.updateUser({ data: { full_name: fullName, contact_phone: phone, city, country }, ...(emailChanged ? { email } : {}) }, { emailRedirectTo: new URL('/auth/callback', appUrl).toString() });
    if (error){await recordActivity(user.id,'profile.update_failed',{summary:'Supabase rejected the profile update.'});return { error: 'Unable to save your profile. Please try again.' };}
    await recordActivity(user.id,'profile.updated',{summary:emailChanged?'Profile saved; email change confirmation requested.':'Profile updated.',fields:['fullName','phone','city','country',...(emailChanged?['email']:[])]});
  } catch {await recordActivity(user.id,'profile.update_failed',{summary:'Profile update service unavailable.'}); return { error: 'Profile updates are unavailable. Please try again.' }; }
  revalidatePath('/', 'layout');
  return { message: emailChanged ? 'Profile saved. Confirm the email change using the links Supabase sends to your inbox.' : 'Your profile has been saved.' };
}
