export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_KEY;
  if (!url || !key || key.startsWith('sb_secret_')) return null;
  try {
    if (key.split('.').length === 3) {
      const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
      if (payload.role !== 'anon') return null;
    }
    new URL(url);
  } catch { return null; }
  return { url, key };
}
