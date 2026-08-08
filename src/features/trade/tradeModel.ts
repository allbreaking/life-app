export type PriceAlert = 'target' | 'safety' | 'watching';
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
