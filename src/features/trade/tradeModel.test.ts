import { expect, test } from 'vitest';
import { centralTargetDistanceFromCurrentPercent, filterWatchlist, halfPositionReductionPrice, isValidTargetPrices, isValidTargetRange, normalizeWatch, paginateWatchlist, parseOptionalWatchRating, parseWatchTags, priceAlert, realizedProfitPercent, safetyDistancePercent, searchWatchlist, searchWatchlistByCode, sortWatchlistByRating, sortWatchlistNewestFirst, targetDistancePercent, unrealizedProfitPercent } from './tradeModel';

test('normalizes legacy target prices without mutating persisted input', () => {
  const legacy = { id: 'w1', target: 40 };
  expect(normalizeWatch(legacy)).toEqual({ id: 'w1', target: 40, optimisticTarget: 40, pessimisticTarget: 40, tags: [] });
  expect(legacy).toEqual({ id: 'w1', target: 40 });
  const complete = { target: 40, optimisticTarget: 45, pessimisticTarget: 36, tags: ['AI', 'AI', '成长'] };
  expect(normalizeWatch(complete)).toEqual({ ...complete, tags: ['AI', '成长'] });
  const oldRatings = { target: 40, cashFlowDividendRating: 4, valuationRating: 2 };
  expect(normalizeWatch(oldRatings)).toEqual({ target: 40, optimisticTarget: 40, pessimisticTarget: 40, tags: [], cashFlowRating: 4 });
  expect(oldRatings).toEqual({ target: 40, cashFlowDividendRating: 4, valuationRating: 2 });
});

test('parses and validates comma-separated watch tags', () => {
  expect(parseWatchTags(' AI，成长, AI ,  ')).toEqual(['AI', '成长']);
  expect(parseWatchTags('')).toEqual([]);
  expect(parseWatchTags('123456789012345678901')).toBeNull();
  expect(parseWatchTags(Array.from({ length: 11 }, (_, index) => `标签${index}`).join(','))).toBeNull();
});

test('parses optional integer watch ratings without conflating blank and zero', () => {
  expect(parseOptionalWatchRating('')).toBeUndefined();
  expect(parseOptionalWatchRating(' 0 ')).toBe(0);
  expect(parseOptionalWatchRating('5')).toBe(5);
  expect(parseOptionalWatchRating('2.5')).toBeNull();
  expect(parseOptionalWatchRating('6')).toBeNull();
});

test('sorts by one rating dimension stably and always keeps unrated items last', () => {
  const items = [
    { id: 'unrated' },
    { id: 'high', profitabilityRating: 5 },
    { id: 'low-a', profitabilityRating: 1 },
    { id: 'low-b', profitabilityRating: 1 },
  ];
  expect(sortWatchlistByRating(items, { key: 'profitabilityRating', direction: 'desc' }).map((item) => item.id)).toEqual(['high', 'low-a', 'low-b', 'unrated']);
  expect(sortWatchlistByRating(items, { key: 'profitabilityRating', direction: 'asc' }).map((item) => item.id)).toEqual(['low-a', 'low-b', 'high', 'unrated']);
  expect(sortWatchlistByRating(items, null)).toEqual(items);
  expect(sortWatchlistByRating(items, null)).not.toBe(items);
  expect(items.map((item) => item.id)).toEqual(['unrated', 'high', 'low-a', 'low-b']);
});

test('sorts newest watch items first and treats later legacy array entries as newer', () => {
  const items = [
    { id: 'legacy-old' },
    { id: 'legacy-new' },
    { id: 'dated-old', createdAt: '2026-08-28T10:00:00.000Z' },
    { id: 'dated-new', createdAt: '2026-08-30T10:00:00.000Z' },
  ];
  expect(sortWatchlistNewestFirst(items).map((item) => item.id)).toEqual(['dated-new', 'dated-old', 'legacy-new', 'legacy-old']);
  expect(items.map((item) => item.id)).toEqual(['legacy-old', 'legacy-new', 'dated-old', 'dated-new']);
});

test('validates optimistic, central, pessimistic and safety price relationships', () => {
  expect(isValidTargetRange(45, 40, 36, 34)).toBe(true);
  expect(isValidTargetRange(40, 40, 40, 0)).toBe(true);
  expect(isValidTargetRange(39, 40, 36, 34)).toBe(false);
  expect(isValidTargetRange(45, 40, 41, 34)).toBe(false);
  expect(isValidTargetRange(45, 40, 36, 40)).toBe(false);
  expect(isValidTargetRange(Number.POSITIVE_INFINITY, 40, 36, 34)).toBe(false);
});

test('validates new watch target prices without requiring a safety price', () => {
  expect(isValidTargetPrices(45, 40, 36)).toBe(true);
  expect(isValidTargetPrices(40, 40, 40)).toBe(true);
  expect(isValidTargetPrices(39, 40, 36)).toBe(false);
  expect(isValidTargetPrices(45, 40, 41)).toBe(false);
  expect(isValidTargetPrices(45, 40, 0)).toBe(false);
});

test('evaluates target and safety price independently per instrument', () => {
  expect(priceAlert(1680, 1680, 1450)).toBe('target');
  expect(priceAlert(1449, 1680, 1450)).toBe('safety');
  expect(priceAlert(1500, 1680, 1450)).toBe('watching');
});

test('filters watchlist price states without changing order or input', () => {
  const items = [
    { id: 'target', current: 10, target: 10, safety: 7, tags: ['成长'] },
    { id: 'watching', current: 8, target: 10, safety: 7, tags: ['成长', '核心'] },
    { id: 'safety', current: 7, target: 10, safety: 7, tags: ['核心'] },
  ];
  expect(filterWatchlist(items, 'target').map((item) => item.id)).toEqual(['target']);
  expect(filterWatchlist(items, 'watching').map((item) => item.id)).toEqual(['watching']);
  expect(filterWatchlist(items, 'safety').map((item) => item.id)).toEqual(['safety']);
  expect(filterWatchlist(items, 'all')).toEqual(items);
  expect(filterWatchlist(items, 'all')).not.toBe(items);
  expect(filterWatchlist(items, 'all', '成长').map((item) => item.id)).toEqual(['target', 'watching']);
  expect(filterWatchlist(items, 'watching', '核心').map((item) => item.id)).toEqual(['watching']);
  expect(filterWatchlist(items, 'target', '核心')).toEqual([]);
});

test('searches watchlists by trimmed partial stock code without mutating input', () => {
  const items = [{ code: '600519' }, { code: '002230' }, { code: '600036' }];
  expect(searchWatchlistByCode(items, ' 600 ')).toEqual([items[0], items[2]]);
  expect(searchWatchlistByCode(items, '223')).toEqual([items[1]]);
  expect(searchWatchlistByCode(items, '   ')).toEqual(items);
  expect(searchWatchlistByCode(items, '')).not.toBe(items);
});

test('searches the observation list by partial stock code or name', () => {
  const items = [
    { code: '600519', name: '贵州茅台' },
    { code: '002230', name: '科大讯飞 AI' },
    { code: '600036', name: '招商银行' },
  ];
  expect(searchWatchlist(items, '茅台')).toEqual([items[0]]);
  expect(searchWatchlist(items, '  AI ')).toEqual([items[1]]);
  expect(searchWatchlist(items, '600')).toEqual([items[0], items[2]]);
  expect(searchWatchlist(items, '')).toEqual(items);
  expect(searchWatchlist(items, '')).not.toBe(items);
});

test('paginates filtered watchlists and clamps empty or out-of-range pages', () => {
  const items = Array.from({ length: 23 }, (_, index) => ({ id: index + 1 }));
  expect(paginateWatchlist(items, 1, 10)).toEqual({ items: items.slice(0, 10), page: 1, pageCount: 3, total: 23 });
  expect(paginateWatchlist(items, 2, 10).items).toEqual(items.slice(10, 20));
  expect(paginateWatchlist(items, 99, 10)).toEqual({ items: items.slice(20), page: 3, pageCount: 3, total: 23 });
  expect(paginateWatchlist([], 5, 10)).toEqual({ items: [], page: 1, pageCount: 1, total: 0 });
  expect(paginateWatchlist(items, Number.NaN, 0).page).toBe(1);
});

test('calculates target and safety percentages from entry cost', () => {
  expect(targetDistancePercent(38.2, 40)).toBeCloseTo(4.712);
  expect(safetyDistancePercent(38.2, 34)).toBeCloseTo(12.353);
  expect(targetDistancePercent(0, 40)).toBeNaN();
  expect(safetyDistancePercent(38.2, 0)).toBeNaN();
});

test('calculates central target distance from the latest current price', () => {
  expect(centralTargetDistanceFromCurrentPercent(1442, 1680)).toBeCloseTo(16.505);
  expect(centralTargetDistanceFromCurrentPercent(41.2, 40)).toBeCloseTo(-2.913);
  expect(centralTargetDistanceFromCurrentPercent(0, 40)).toBeNaN();
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
