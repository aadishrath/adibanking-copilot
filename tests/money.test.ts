import { test, expect } from '@jest/globals';
import { parseAmountCents } from '@/lib/money';
test('parses decimal amounts exactly', () => {
  expect(parseAmountCents('0.29')).toBe(29);
  expect(parseAmountCents('10.1')).toBe(1010);
  expect(parseAmountCents(' 1000000.00 ')).toBe(100000000);
});
test('rejects fractions beyond cents, exponents, negatives, zero and limits', () => {
  for (const value of ['1.001', '1e2', '-1', '0', 'NaN', 'Infinity', '1000000.01', '1,000', '']) expect(() => parseAmountCents(value)).toThrow();
});
