import { expect, test } from 'vitest';
import { budgetProgress, parseMoneyToCents, parsePositiveWholeUnits, wealthGoalProgress } from './financeModel';

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

test('parses only safe positive whole goal units', () => {
  expect(parsePositiveWholeUnits('10')).toBe(10);
  expect(parsePositiveWholeUnits(' 2 ')).toBe(2);
  for (const value of ['', '0', '-1', '1.5', '1e3', '9007199254740992']) {
    expect(parsePositiveWholeUnits(value)).toBeNull();
  }
});

test('derives the fixed 500 yuan unit goal progress', () => {
  expect(wealthGoalProgress(1500)).toEqual({
    completedUnits: 1500,
    targetUnits: 3000,
    completedCents: 75_000_000,
    targetCents: 150_000_000,
    percent: 50,
    remainingUnits: 1500,
  });
});
