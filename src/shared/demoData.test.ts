import { expect, test } from 'vitest';
import { runtimeInitialValue } from './demoData';

test('removes demo fixtures from production domain defaults', () => {
  expect(runtimeInitialValue('trade.watchlist', [{ id: 'demo' }], true)).toEqual([]);
  expect(runtimeInitialValue('work.tasks', { Q1: ['demo'], Q2: [], Q3: [], Q4: [] }, true)).toEqual({ Q1: [], Q2: [], Q3: [], Q4: [] });
  expect(runtimeInitialValue('trade.sop', 'demo SOP', true)).toBe('');
});

test('keeps fixtures available outside production', () => {
  const fixture = [{ id: 'demo' }];
  expect(runtimeInitialValue('trade.watchlist', fixture, false)).toBe(fixture);
});
