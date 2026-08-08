import { expect, test } from 'vitest';
import { priceAlert } from './tradeModel';

test('evaluates target and safety price independently per instrument', () => {
  expect(priceAlert(1680, 1680, 1450)).toBe('target');
  expect(priceAlert(1449, 1680, 1450)).toBe('safety');
  expect(priceAlert(1500, 1680, 1450)).toBe('watching');
});
