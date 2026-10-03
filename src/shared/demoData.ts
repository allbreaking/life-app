import type { DomainResource } from './ipc/domainResource';

export const isDemoMode = !import.meta.env.PROD;

const productionDefaults: Partial<Record<DomainResource, unknown>> = {
  'compass.principles': { being: [], doing: [] },
  'dashboard.completedTodoIndexes': [],
  'dashboard.dailyOutput': [],
  'dashboard.dailyTasks': [],
  'dashboard.completedEvents': {},
  'finance.budgetCents': 0,
  'finance.spentCents': 0,
  'finance.pending': [],
  'finance.goalCompletedUnits': 1500,
  'finance.transactions': [],
  'finance.subscriptions': [],
  'items.foods': [],
  'items.items': [],
  'network.people': [],
  'health.records': {},
  'trade.watchlist': [],
  'trade.positions': [],
  'trade.reviews': [],
  'trade.sop': '',
};

/** Side effects: none. Selects demo fixtures outside production and empty domain defaults in production. */
export function runtimeInitialValue<T>(resource: DomainResource, demoValue: T, production = import.meta.env.PROD): T {
  if (!production) return demoValue;
  return (productionDefaults[resource] ?? demoValue) as T;
}
