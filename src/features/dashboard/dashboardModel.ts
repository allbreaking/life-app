import { foodExpiryStatus, type Food } from '../items/itemModel';
import { budgetProgress } from '../finance/financeModel';
import type { Person } from '../network/networkModel';

export type DashboardAlertTone = 'crimson' | 'amber';
export type DashboardAlertModule = '物品' | '财务';

export type DashboardAlert = { id: string; label: string; tone: DashboardAlertTone; module: DashboardAlertModule };
export type DashboardImportantDate = { id: string; label: string };

export type DashboardSources = {
  foods: readonly Food[];
  budgetCents: number;
  spentCents: number;
  people: readonly Person[];
};

/** Side effects: none. Aggregates food-expiry and budget alerts from persisted module data. */
export function aggregateAlerts(sources: DashboardSources, now = new Date()): DashboardAlert[] {
  const alerts: DashboardAlert[] = [];

  for (const food of sources.foods) {
    const status = foodExpiryStatus(food.expiry, now);
    if (status.tone !== 'normal') {
      alerts.push({ id: `food:${food.id}`, label: `${food.name} · ${status.label}`, tone: status.tone, module: '物品' });
    }
  }

  if (sources.budgetCents > 0) {
    const progress = budgetProgress(sources.spentCents, sources.budgetCents, now);
    if (progress.alert === 'crimson') {
      alerts.push({ id: 'budget', label: `本月预算已用尽（${Math.round(progress.actualPercent)}%）`, tone: 'crimson', module: '财务' });
    } else if (progress.alert === 'amber') {
      alerts.push({ id: 'budget', label: `本月预算已用 ${Math.round(progress.actualPercent)}%，领先时间进度 ${Math.round(progress.leadPercent)}%`, tone: 'amber', module: '财务' });
    }
  }

  return alerts;
}

/** Side effects: none. Lists contacts that carry a free-text important date, without deriving a countdown. */
export function aggregateImportantDates(people: readonly Person[]): DashboardImportantDate[] {
  return people
    .filter((person) => person.importantDate)
    .map((person) => ({ id: person.id, label: `${person.name} · ${person.importantDate}` }));
}

/** Side effects: none. Derives the card-level alert tone from the most severe present alert. */
export function alertCardTone(alerts: readonly DashboardAlert[]): DashboardAlertTone | null {
  if (alerts.some((alert) => alert.tone === 'crimson')) return 'crimson';
  if (alerts.some((alert) => alert.tone === 'amber')) return 'amber';
  return null;
}
