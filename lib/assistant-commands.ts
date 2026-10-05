import { parseAmountCents } from '@/lib/money';
import type { Account } from '@/types/account';

export const REFUSAL = 'Cannot process this request. I can only help with AdiBank accounts, transactions, analytics, profiles, and transfers.';
export const ASSISTANT_HELP = 'Try: “show my accounts”, “show my transactions”, “show my monthly summary”, “show my spending categories”, “profile help”, or “transfer 25.00 from checking to savings”. Use exact account names if you have more than one account of a type. Transfers require your confirmation and use sandbox funds.';
export type AssistantCommand =
  | { kind: 'help' | 'profile' | 'accounts' | 'transactions' | 'analytics' | 'categories' }
  | { kind: 'balance'; account: string }
  | { kind: 'transfer'; from: string; to: string; amount: string; currency?: string }
  | { kind: 'transferHelp' | 'refuse' };

// Complete, anchored command grammars are the scope boundary. No free-form
// model output, embedded instructions, or compound requests are executed.
export function parseAssistantCommand(input: string): AssistantCommand {
  const text = input.trim().replace(/[.!?]$/, '').replace(/^please\s+/i, '').trim();
  if (/[;\r\n]|https?:\/\/|\b(?:and|then|also|ignore|instructions)\b/i.test(text)) return { kind: 'refuse' };
  if (/^(?:help|hi|hello|what can you do|how (?:do i|to) use (?:adibank|this app))$/i.test(text)) return { kind: 'help' };
  if (/^(?:profile help|(?:show|open|edit|update) (?:my )?profile|how (?:do i|to) (?:edit|update) (?:my )?profile)$/i.test(text)) return { kind: 'profile' };
  if (/^(?:(?:show|list|view) (?:me )?(?:my )?(?:accounts|account balances|balances)|(?:my )?(?:accounts|balances)|what are my (?:accounts|balances)|how much money do i have)$/i.test(text)) return { kind: 'accounts' };
  if (/^(?:(?:show|list|view) (?:me )?(?:my )?(?:(?:recent|latest) )?transactions|(?:my )?(?:recent )?transactions)$/i.test(text)) return { kind: 'transactions' };
  if (/^(?:(?:show|view) (?:me )?(?:my )?)?(?:monthly summary|monthly analytics|income|expenses|savings|cash flow)(?: (?:this month|for this month))?$/i.test(text)) return { kind: 'analytics' };
  if (/^(?:how much (?:did i|have i) (?:spend|spent|earn|earned|save|saved)|what (?:is|are) my (?:income|expenses|savings))(?: this month)?$/i.test(text)) return { kind: 'analytics' };
  if (/^(?:(?:show|view) (?:me )?(?:my )?)?(?:spending categories|expense categories|category breakdown)(?: (?:this month|for this month))?$/i.test(text)) return { kind: 'categories' };
  if (/^what (?:am i spending|did i spend) (?:money )?on(?: this month)?$/i.test(text)) return { kind: 'categories' };
  const balance = text.match(/^(?:show (?:me )?(?:my )?balance (?:of|for)|what is (?:my|the) balance (?:of|for)) (.{1,100})$/i);
  if (balance) return { kind: 'balance', account: balance[1] };
  if (/^(?:transfer|make (?:a )?transfer|how (?:do i|to) (?:make a )?transfer(?: funds)?|transfer help)$/i.test(text)) return { kind: 'transferHelp' };
  const amount = '((?:(?:USD|EUR|GBP)\\s*|[$€£])?\\d[\\d,.]*(?:\\s*(?:USD|EUR|GBP|dollars|euros|pounds))?)';
  const first = text.match(new RegExp(`^(?:make (?:a )?transfer|transfer|move|send)(?: funds)? from (.{1,100}?) to (.{1,100}?) (?:for|of) ${amount}(?: amount)?$`, 'i'));
  const second = text.match(new RegExp(`^(?:transfer|move|send|make (?:a )?transfer(?: of)?) ${amount} from (.{1,100}?) to (.{1,100}?)$`, 'i'));
  if (!first && !second) return { kind: 'refuse' };
  const from = first ? first[1] : second![2], to = first ? first[2] : second![3];
  const raw = first ? first[3] : second![1];
  const unit = raw.match(/USD|EUR|GBP|dollars|euros|pounds|[$€£]/i)?.[0].toUpperCase();
  const currency = unit ? ({ '$': 'USD', DOLLARS: 'USD', '€': 'EUR', EUROS: 'EUR', '£': 'GBP', POUNDS: 'GBP' } as Record<string, string>)[unit] ?? unit : undefined;
  const numeric = raw.replace(/USD|EUR|GBP|dollars|euros|pounds|[$€£]/gi, '').trim();
  // Commas are accepted only as correctly grouped thousands separators.
  if (numeric.includes(',') && !/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(numeric)) throw Error('Use an amount such as 25.00 or 1,000.00.');
  parseAmountCents(numeric.replaceAll(',', ''));
  return { kind: 'transfer', from, to, amount: numeric.replaceAll(',', ''), currency };
}

export function resolveAccount(label: string, accounts: Account[]): Account {
  const normalize = (value: string) => value.trim().replace(/^["']|["']$/g, '').toLowerCase();
  const key = normalize(label), short = key.replace(/ account$/, '').replace(/^(?:my|the) /, '');
  const exact = accounts.filter(account => normalize(account.name) === key || account.id.toLowerCase() === key);
  const matches = exact.length ? exact : accounts.filter(account => normalize(account.name) === short || account.accountType === short);
  if (matches.length !== 1) throw Error(matches.length ? 'That account name is ambiguous. Use the exact account name or ID from Accounts.' : 'That account is not available in your AdiBank workspace. Use “show my accounts” to check its name.');
  return matches[0];
}

export function prepareTransfer(command: Extract<AssistantCommand, { kind: 'transfer' }>, accounts: Account[]) {
  const from = resolveAccount(command.from, accounts), to = resolveAccount(command.to, accounts);
  const amountCents = parseAmountCents(command.amount);
  if (from.id === to.id) throw Error('Choose two different accounts for the transfer.');
  if (from.status !== 'active' || to.status !== 'active') throw Error('Both accounts must be active. Check their status in Accounts.');
  if (from.currency !== to.currency || (command.currency && command.currency !== from.currency)) throw Error('Both accounts and the requested amount must use the same currency. Currency conversion is unavailable.');
  if (amountCents > (from.balanceCents ?? 0)) throw Error('The source account does not have enough available sandbox funds.');
  return { from, to, amountCents, currency: from.currency };
}
