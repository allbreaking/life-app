import type { DomainResource } from './ipc/domainResource';

export const isDemoMode = !import.meta.env.PROD;

const productionDefaults: Partial<Record<DomainResource, unknown>> = {
  'compass.principles': { being: [], doing: [] },
  'dashboard.completedTodoIndexes': [],
  'work.tasks': { Q1: [], Q2: [], Q3: [], Q4: [] },
  'work.focusIds': [],
  'work.eodSubmitted': false,
  'schedule.pool': [],
  'schedule.scheduled': [],
  'schedule.lifeSchedules': [],
  'finance.budgetCents': 0,
  'finance.spentCents': 0,
  'finance.pending': [],
  'finance.lastTransaction': null,
  'items.foods': [],
  'items.items': [],
  'network.people': [],
  'trade.watchlist': [],
  'trade.positions': [],
  'trade.reviews': [],
  'trade.sop': '',
  'learning.domains': [],
};

/** Side effects: none. Selects demo fixtures outside production and empty domain defaults in production. */
export function runtimeInitialValue<T>(resource: DomainResource, demoValue: T, production = import.meta.env.PROD): T {
  if (!production) return demoValue;
  return (productionDefaults[resource] ?? demoValue) as T;
}
