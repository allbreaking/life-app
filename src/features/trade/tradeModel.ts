export type PriceAlert = 'target' | 'safety' | 'watching';
export type WatchFilter = 'all' | PriceAlert;
export type WatchRatingKey = 'businessModelRating' | 'profitabilityRating' | 'financialStabilityRating' | 'cashFlowRating';
export type WatchRatingSort = { key: WatchRatingKey; direction: 'asc' | 'desc' } | null;

type WatchPriceState = { current: number; target: number; safety: number; tags?: readonly string[] };

export type WatchPage<T> = {
  items: T[];
  page: number;
  pageCount: number;
  total: number;
};

export type WatchTargetPrices = {
  target: number;
  optimisticTarget?: number;
  pessimisticTarget?: number;
  tags?: string[];
  cashFlowDividendRating?: number;
  valuationRating?: number;
} & Partial<Record<WatchRatingKey, number>>;

/** Specs: trade-watch-target-range, trade-watch-tags, and trade-watch-ratings. Side effects: none. */
export function normalizeWatch<T extends WatchTargetPrices>(input: T): Omit<T, 'cashFlowDividendRating' | 'valuationRating'> & Required<Pick<WatchTargetPrices, 'optimisticTarget' | 'pessimisticTarget' | 'tags'>> {
  const { cashFlowDividendRating, valuationRating: _discardedValuationRating, ...current } = input;
  return {
    ...current,
    ...(current.cashFlowRating === undefined && cashFlowDividendRating !== undefined ? { cashFlowRating: cashFlowDividendRating } : {}),
    optimisticTarget: input.optimisticTarget ?? input.target,
    pessimisticTarget: input.pessimisticTarget ?? input.target,
    tags: [...new Set(input.tags ?? [])],
  } as Omit<T, 'cashFlowDividendRating' | 'valuationRating'> & Required<Pick<WatchTargetPrices, 'optimisticTarget' | 'pessimisticTarget' | 'tags'>>;
}

/** Spec: docs/specs/trade-watch-tags/01-watch-tags.spec.md (2026-08-23). Side effects: none. */
export function parseWatchTags(input: string): string[] | null {
  const tags = [...new Set(input.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean))];
  return tags.length <= 10 && tags.every((tag) => tag.length <= 20) ? tags : null;
}

/** Spec: docs/specs/trade-watch-ratings/01-trade-watch-ratings.spec.md (2026-08-30). Side effects: none. */
export function parseOptionalWatchRating(input: string): number | undefined | null {
  const normalized = input.trim();
  if (!normalized) return undefined;
  return /^[0-5]$/.test(normalized) ? Number(normalized) : null;
}

/** Spec: docs/specs/trade-watch-ratings/01-trade-watch-ratings.spec.md (2026-08-30). Side effects: none. */
export function sortWatchlistByRating<T extends Partial<Record<WatchRatingKey, number>>>(items: readonly T[], sort: WatchRatingSort): T[] {
  if (!sort) return [...items];
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const leftRating = left.item[sort.key];
      const rightRating = right.item[sort.key];
      if (leftRating === undefined && rightRating === undefined) return left.index - right.index;
      if (leftRating === undefined) return 1;
      if (rightRating === undefined) return -1;
      const difference = sort.direction === 'asc' ? leftRating - rightRating : rightRating - leftRating;
      return difference || left.index - right.index;
    })
    .map(({ item }) => item);
}

/** Spec: docs/specs/trade-watch-ratings/01-trade-watch-ratings.spec.md (2026-08-30). Side effects: none. */
export function sortWatchlistNewestFirst<T extends { createdAt?: string }>(items: readonly T[]): T[] {
  return items
    .map((item, index) => ({ item, index, timestamp: item.createdAt ? Date.parse(item.createdAt) : Number.NaN }))
    .sort((left, right) => {
      const leftHasTime = Number.isFinite(left.timestamp);
      const rightHasTime = Number.isFinite(right.timestamp);
      if (leftHasTime && rightHasTime) return right.timestamp - left.timestamp || right.index - left.index;
      if (leftHasTime) return -1;
      if (rightHasTime) return 1;
      return right.index - left.index;
    })
    .map(({ item }) => item);
}

/** Spec: docs/specs/trade-watch-target-range/01-watch-target-range.spec.md (2026-08-30). Side effects: none. */
export function isValidTargetPrices(optimisticTarget: number, target: number, pessimisticTarget: number): boolean {
  return [optimisticTarget, target, pessimisticTarget].every(Number.isFinite)
    && optimisticTarget > 0 && target > 0 && pessimisticTarget > 0
    && optimisticTarget >= target && target >= pessimisticTarget;
}

/** Spec: docs/specs/trade-watch-target-range/01-watch-target-range.spec.md (2026-08-09). Side effects: none. */
export function isValidTargetRange(optimisticTarget: number, target: number, pessimisticTarget: number, safety: number): boolean {
  return isValidTargetPrices(optimisticTarget, target, pessimisticTarget)
    && Number.isFinite(safety) && safety >= 0 && safety < target;
}

/** Side effects: none. Evaluates one instrument independently. */
export function priceAlert(current: number, target: number, safety: number): PriceAlert { return current >= target ? 'target' : current <= safety ? 'safety' : 'watching'; }

/** Specs: trade-watch-filter-pagination and trade-watch-tags. Side effects: none. */
export function filterWatchlist<T extends WatchPriceState>(items: readonly T[], filter: WatchFilter, tagFilter = ''): T[] {
  return items.filter((item) => (filter === 'all' || priceAlert(item.current, item.target, item.safety) === filter) && (!tagFilter || item.tags?.includes(tagFilter)));
}

/** Spec: docs/specs/trade-stock-code-search/01-trade-stock-code-search.spec.md (2026-08-26). Side effects: none. */
export function searchWatchlistByCode<T extends { code: string }>(items: readonly T[], query: string): T[] {
  const normalizedQuery = query.trim();
  return normalizedQuery ? items.filter((item) => item.code.includes(normalizedQuery)) : [...items];
}

/** Spec: docs/specs/trade-stock-code-search/01-trade-stock-code-search.spec.md (2026-08-29). Side effects: none. */
export function searchWatchlist<T extends { code: string; name: string }>(items: readonly T[], query: string): T[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return normalizedQuery
    ? items.filter((item) => item.code.includes(normalizedQuery) || item.name.toLocaleLowerCase().includes(normalizedQuery))
    : [...items];
}

/** Spec: docs/specs/trade-watch-filter-pagination/01-watch-filter-pagination.spec.md (2026-08-19). Side effects: none. */
export function paginateWatchlist<T>(items: readonly T[], requestedPage: number, requestedPageSize = 10): WatchPage<T> {
  const pageSize = Number.isFinite(requestedPageSize) && requestedPageSize > 0 ? Math.floor(requestedPageSize) : 10;
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const normalizedPage = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;
  const page = Math.min(normalizedPage, pageCount);
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page, pageCount, total: items.length };
}

/** Side effects: none. Returns target price relative to entry cost as a percentage difference. */
export function targetDistancePercent(cost: number, target: number): number {
  if (!Number.isFinite(cost) || cost <= 0 || !Number.isFinite(target) || target <= 0) return Number.NaN;
  return ((target / cost) - 1) * 100;
}

/** Spec: docs/specs/trade-stock-code-search/01-trade-stock-code-search.spec.md (2026-08-30). Side effects: none. Accepts any watch target tier. */
export function centralTargetDistanceFromCurrentPercent(current: number, target: number): number {
  if (!Number.isFinite(current) || current <= 0 || !Number.isFinite(target) || target <= 0) return Number.NaN;
  return ((target / current) - 1) * 100;
}

/** Side effects: none. Returns entry cost relative to safety price as a percentage difference. */
export function safetyDistancePercent(cost: number, safety: number): number {
  if (!Number.isFinite(cost) || cost <= 0 || !Number.isFinite(safety) || safety <= 0) return Number.NaN;
  return ((cost / safety) - 1) * 100;
}

/** Side effects: none. Returns realized profit/loss percentage from entry cost to closing price. */
export function realizedProfitPercent(cost: number, closePrice: number): number {
  if (!Number.isFinite(cost) || cost <= 0 || !Number.isFinite(closePrice) || closePrice <= 0) return Number.NaN;
  return ((closePrice / cost) - 1) * 100;
}

/** Side effects: none. Returns unrealized profit/loss percentage from entry cost to current price. */
export function unrealizedProfitPercent(cost: number, current: number): number {
  if (!Number.isFinite(cost) || cost <= 0 || !Number.isFinite(current) || current <= 0) return Number.NaN;
  return ((current / cost) - 1) * 100;
}

/** Side effects: none. Returns the half-position sale price that makes remaining book cost equal safety, when applicable. */
export function halfPositionReductionPrice(cost: number, safety: number): number | null {
  if (!Number.isFinite(cost) || cost <= 0 || !Number.isFinite(safety) || safety < 0 || cost <= safety) return null;
  return (2 * cost) - safety;
}
