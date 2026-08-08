import { expect, test } from 'vitest';
import { halfPositionReductionPrice, priceAlert, realizedProfitPercent, safetyDistancePercent, targetDistancePercent, unrealizedProfitPercent } from './tradeModel';

test('evaluates target and safety price independently per instrument', () => {
  expect(priceAlert(1680, 1680, 1450)).toBe('target');
  expect(priceAlert(1449, 1680, 1450)).toBe('safety');
  expect(priceAlert(1500, 1680, 1450)).toBe('watching');
});

test('calculates target and safety percentages from entry cost', () => {
  expect(targetDistancePercent(38.2, 40)).toBeCloseTo(4.712);
  expect(safetyDistancePercent(38.2, 34)).toBeCloseTo(12.353);
  expect(targetDistancePercent(0, 40)).toBeNaN();
  expect(safetyDistancePercent(38.2, 0)).toBeNaN();
});

test('derives the sale price that makes the remaining half position reach safety cost', () => {
  const reductionPrice = halfPositionReductionPrice(38.2, 34);
  expect(reductionPrice).toBeCloseTo(42.4);
  expect((38.2 * 2) - reductionPrice!).toBeCloseTo(34);
  expect(halfPositionReductionPrice(34, 34)).toBeNull();
  expect(halfPositionReductionPrice(30, 34)).toBeNull();
});

test('calculates realized profit and loss from entry to closing price', () => {
  expect(realizedProfitPercent(40, 46)).toBeCloseTo(15);
  expect(realizedProfitPercent(40, 36)).toBeCloseTo(-10);
  expect(realizedProfitPercent(40, 0)).toBeNaN();
});

test('calculates unrealized profit and loss from entry to current price', () => {
  expect(unrealizedProfitPercent(40, 46)).toBeCloseTo(15);
  expect(unrealizedProfitPercent(40, 36)).toBeCloseTo(-10);
});
