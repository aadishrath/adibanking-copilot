export const MAX_TRANSFER_CENTS = 100_000_000;

/** Parse decimal text without floating-point arithmetic or implicit rounding. */
export function parseAmountCents(value: string): number {
  const text = value.trim();
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(text)) throw new Error('Enter an amount with at most two decimal places.');
  const [whole, fraction = ''] = text.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > MAX_TRANSFER_CENTS) throw new Error('Enter an amount between 0.01 and 1,000,000.00.');
  return cents;
}
