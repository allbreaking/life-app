export type PriceAlert = 'target' | 'safety' | 'watching';

export type WatchTargetPrices = {
  target: number;
  optimisticTarget?: number;
  pessimisticTarget?: number;
};

/** Spec: docs/specs/trade-watch-target-range/01-watch-target-range.spec.md (2026-08-09). Side effects: none. */
export function normalizeWatch<T extends WatchTargetPrices>(input: T): T & Required<Pick<WatchTargetPrices, 'optimisticTarget' | 'pessimisticTarget'>> {
  return { ...input, optimisticTarget: input.optimisticTarget ?? input.target, pessimisticTarget: input.pessimisticTarget ?? input.target };
}

/** Spec: docs/specs/trade-watch-target-range/01-watch-target-range.spec.md (2026-08-09). Side effects: none. */
export function isValidTargetRange(optimisticTarget: number, target: number, pessimisticTarget: number, safety: number): boolean {
  return [optimisticTarget, target, pessimisticTarget, safety].every(Number.isFinite)
    && optimisticTarget > 0 && target > 0 && pessimisticTarget > 0
    && optimisticTarget >= target && target >= pessimisticTarget
    && safety >= 0 && safety < target;
}

/** Side effects: none. Evaluates one instrument independently. */
export function priceAlert(current: number, target: number, safety: number): PriceAlert { return current >= target ? 'target' : current <= safety ? 'safety' : 'watching'; }

/** Side effects: none. Returns target price relative to entry cost as a percentage difference. */
export function targetDistancePercent(cost: number, target: number): number {
  if (!Number.isFinite(cost) || cost <= 0 || !Number.isFinite(target) || target <= 0) return Number.NaN;
  return ((target / cost) - 1) * 100;
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
