import { expect, test } from 'vitest';
import { budgetProgress, parseMoneyToCents } from './financeModel';

test('parses money as integer cents and rejects unsafe input', () => {
  expect(parseMoneyToCents('-35.20')).toBe(-3520);
  expect(parseMoneyToCents('12.345')).toBeNull();
  expect(parseMoneyToCents('0')).toBeNull();
});

test('uses amber when consumption leads time and crimson at 100 percent', () => {
  const now = new Date('2026-08-16T12:00:00');
  expect(budgetProgress(60_000, 100_000, now).alert).toBe('amber');
  expect(budgetProgress(100_000, 100_000, now).alert).toBe('crimson');
});
