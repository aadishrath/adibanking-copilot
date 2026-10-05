import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getViewer } from '@/lib/auth/session';
import { canAccess } from '@/lib/auth/roles';
import { ApiError, apiFailure, readJson } from '@/lib/api/errors';
import { getBankingSnapshot, usesPersistentBanking } from '@/lib/banking';
import { readAnalytics } from '@/lib/analytics';
import { analyticsSchema } from '@/lib/analytics-schema';
import { ASSISTANT_HELP, REFUSAL, parseAssistantCommand, prepareTransfer, resolveAccount } from '@/lib/assistant-commands';
import { issueTransferToken } from '@/lib/assistant-tokens';

export const runtime = 'nodejs';
const ChatBody = z.object({ prompt: z.string().trim().min(1, 'Enter a message.').max(4000, 'Keep messages under 4000 characters.'), currency: z.enum(['USD','EUR','GBP']).default('USD'), timezone: z.string().min(1).max(100).default('America/Los_Angeles') }).strict();
const limits = new Map<string, { count: number; resetAt: number }>();
const money = (cents: number, currency: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const reply = (assistant: string, proposal?: unknown) => NextResponse.json({ assistant, ...(proposal ? { proposal } : {}), requestId }, { headers: { 'Cache-Control': 'private, no-store', 'X-Request-Id': requestId } });
  try {
    const viewer = await getViewer();
    if (!viewer) throw new ApiError(401, 'Your session is unavailable or expired. Sign in again to use the banking assistant.');
    if (!canAccess(viewer.role, 'assistant')) throw new ApiError(403, 'Your role cannot use the banking assistant.');
    const { prompt, currency, timezone } = await readJson(request, ChatBody);
    const now = Date.now();
    for (const [id, entry] of limits) if (entry.resetAt <= now) limits.delete(id);
    const entry = limits.get(viewer.id) ?? { count: 0, resetAt: now + 60_000 };
    if (entry.count >= 30) throw new ApiError(429, 'The assistant request limit was reached. Wait one minute, then try again.');
    if (limits.size >= 10_000 && !limits.has(viewer.id)) throw new ApiError(503, 'The assistant service is busy. Please try again shortly.');
    limits.set(viewer.id, { ...entry, count: entry.count + 1 });
    let command;
    try { command = parseAssistantCommand(prompt); }
    catch (error) { return reply(error instanceof Error ? error.message : 'Check the requested amount.'); }
    if (command.kind === 'refuse') return reply(REFUSAL);
    if (command.kind === 'help') return reply(ASSISTANT_HELP);
    if (command.kind === 'profile') return reply('Open the person icon in the top navigation, then choose Profile. You can edit your name, email, contact phone, city, and country. Email changes require confirmation. Your role cannot be changed in your profile.');
    if (command.kind === 'transferHelp') return reply('Use “transfer 25.00 from checking to savings” or “make transfer from Checking account to Savings account for 25.00”. Use exact account names when account types are ambiguous. I will show a confirmation first.');
    if (!usesPersistentBanking()) throw new ApiError(503, 'The banking backend is in fixture-only mode. Live account queries and chat transfers require Supabase banking configuration.');
    if (command.kind === 'analytics' || command.kind === 'categories') {
      const query = new Request(`http://internal/api/analytics?${new URLSearchParams({ currency, timezone })}`);
      const data = analyticsSchema.parse(await readAnalytics(query));
      const current = data.months.find(row => row.month === data.month);
      if (!current) throw new ApiError(503, 'The analytics backend did not return the current month.');
      if (command.kind === 'categories') return reply(data.categories.length ? `${data.month} expenses in ${currency}:\n${data.categories.map(row => `${row.category}: ${money(row.expenseCents, currency)}`).join('\n')}\nOpen Analytics to inspect the category transactions.` : `No expenses in ${currency} this month.`);
      return reply(`${data.month} (${currency}, ${timezone})\nIncome: ${money(current.incomeCents,currency)}\nExpenses: ${money(current.expenseCents,currency)}\nNet savings: ${money(current.savingsCents,currency)}\nOpening balances and internal transfers are excluded.`);
    }
    const snapshot = await getBankingSnapshot(viewer.id);
    if (command.kind === 'accounts') return reply(snapshot.accounts.length ? `Your accounts:\n${snapshot.accounts.slice(0,25).map(account => `${account.name} (${account.status}, ${account.currency}): ${money(account.balanceCents ?? 0,account.currency)}`).join('\n')}${snapshot.accounts.length > 25 ? '\nShowing the first 25. Open Accounts for the full list.' : ''}` : 'You have no accounts yet. Create a sandbox account in Accounts.');
    if (command.kind === 'transactions') {
      try { new Intl.DateTimeFormat('en-US',{timeZone:timezone}); }
      catch { throw new ApiError(400,'Choose a valid time zone for transaction dates.'); }
      return reply(snapshot.transactions.length ? `Your 10 most recent transactions:\n${snapshot.transactions.slice(0,10).map(row => `${new Date(row.createdAt).toLocaleDateString('en-US',{timeZone:timezone})} · ${(row.description ?? '').slice(0,150)} · ${money(row.amountCents ?? 0,row.currency ?? 'USD')}`).join('\n')}\nOpen Transactions to manage entries.` : 'You have no transactions yet.');
    }
    try {
      if (command.kind === 'balance') {
        const account = resolveAccount(command.account,snapshot.accounts);
        return reply(`${account.name}: ${money(account.balanceCents ?? 0,account.currency)} (${account.status}).`);
      }
      if (command.kind !== 'transfer') return reply(REFUSAL);
      const plan = prepareTransfer(command,snapshot.accounts);
      const secret = process.env.CHAT_TRANSFER_SIGNING_SECRET ?? '';
      if (secret.length < 32) throw new ApiError(503, 'Chat transfer confirmation is not configured on the server. You can still use the Transfers page.');
      const signed = issueTransferToken({ userId:viewer.id,fromId:plan.from.id,toId:plan.to.id,amountCents:plan.amountCents,currency:plan.currency },secret);
      return reply('Review this sandbox transfer below. No funds move until you press Confirm transfer.', { token:signed.token,fromName:plan.from.name,toName:plan.to.name,fromId:plan.from.id,toId:plan.to.id,amountCents:plan.amountCents,currency:plan.currency,expiresAt:signed.payload.expiresAt });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      return reply(error instanceof Error ? error.message : 'The transfer details could not be prepared.');
    }
  } catch (error) { return apiFailure(error,requestId); }
}
