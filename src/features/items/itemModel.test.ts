import { expect, test } from 'vitest';
import { foodExpiryStatus } from './itemModel';

const today = new Date('2026-08-02T12:00:00');

test('applies food expiry boundaries at 3 and 7 days', () => {
  expect(foodExpiryStatus('2026-08-05', today).tone).toBe('crimson');
  expect(foodExpiryStatus('2026-08-06', today).tone).toBe('amber');
  expect(foodExpiryStatus('2026-08-09', today).tone).toBe('amber');
  expect(foodExpiryStatus('2026-08-10', today).tone).toBe('normal');
  expect(foodExpiryStatus('2026-08-01', today).label).toBe('已过期 1 天');
});
