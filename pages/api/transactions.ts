import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../lib/supabaseClient';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // For demo: return mock data if no supabase configured
  if (!process.env.SUPABASE_SERVICE_ROLE) {
    const data = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/mock-data/accounts.json`).then(r => r.json());
    return res.status(200).json({ accounts: data });
  }
  // otherwise query supabase
  const { data, error } = await supabase.from('transactions').select('*').limit(50);
  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json({ transactions: data });
}
