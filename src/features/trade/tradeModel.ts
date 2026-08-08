export type PriceAlert = 'target' | 'safety' | 'watching';
/** Side effects: none. Evaluates one instrument independently. */
export function priceAlert(current: number, target: number, safety: number): PriceAlert { return current >= target ? 'target' : current <= safety ? 'safety' : 'watching'; }
