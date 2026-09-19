import { expect, test } from 'vitest';
import { runtimeInitialValue } from './demoData';

test('removes demo fixtures from production domain defaults', () => {
  expect(runtimeInitialValue('trade.watchlist', [{ id: 'demo' }], true)).toEqual([]);
  expect(runtimeInitialValue('trade.sop', 'demo SOP', true)).toBe('');
  expect(runtimeInitialValue('finance.goalCompletedUnits', 0, true)).toBe(1500);
});

test('keeps fixtures available outside production', () => {
  const fixture = [{ id: 'demo' }];
  expect(runtimeInitialValue('trade.watchlist', fixture, false)).toBe(fixture);
});
