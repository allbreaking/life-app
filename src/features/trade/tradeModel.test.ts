import { expect, test } from 'vitest';
import { halfPositionReductionPrice, isValidTargetRange, normalizeWatch, priceAlert, realizedProfitPercent, safetyDistancePercent, targetDistancePercent, unrealizedProfitPercent } from './tradeModel';

test('normalizes legacy target prices without mutating persisted input', () => {
  const legacy = { id: 'w1', target: 40 };
  expect(normalizeWatch(legacy)).toEqual({ id: 'w1', target: 40, optimisticTarget: 40, pessimisticTarget: 40 });
  expect(legacy).toEqual({ id: 'w1', target: 40 });
  const complete = { target: 40, optimisticTarget: 45, pessimisticTarget: 36 };
  expect(normalizeWatch(complete)).toEqual(complete);
});

test('validates optimistic, central, pessimistic and safety price relationships', () => {
  expect(isValidTargetRange(45, 40, 36, 34)).toBe(true);
  expect(isValidTargetRange(40, 40, 40, 0)).toBe(true);
  expect(isValidTargetRange(39, 40, 36, 34)).toBe(false);
  expect(isValidTargetRange(45, 40, 41, 34)).toBe(false);
  expect(isValidTargetRange(45, 40, 36, 40)).toBe(false);
  expect(isValidTargetRange(Number.POSITIVE_INFINITY, 40, 36, 34)).toBe(false);
});

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
