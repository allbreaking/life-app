export type BudgetAlert = 'normal' | 'amber' | 'crimson';

export const WEALTH_GOAL_UNITS = 3000;
export const WEALTH_GOAL_UNIT_CENTS = 50_000;

/** Side effects: none. Calculates budget consumption using integer cents. */
export function budgetProgress(spentCents: number, budgetCents: number, now = new Date()) {
  const actualPercent = budgetCents > 0 ? spentCents / budgetCents * 100 : 100;
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const timePercent = ((now.getDate() - 1 + (now.getHours() * 60 + now.getMinutes()) / 1440) / days) * 100;
  const alert: BudgetAlert = actualPercent >= 100 ? 'crimson' : actualPercent > timePercent ? 'amber' : 'normal';
  return { actualPercent, timePercent, leadPercent: actualPercent - timePercent, alert };
}

/** Side effects: none. Converts a decimal currency string to integer cents. */
export function parseMoneyToCents(value: string): number | null {
  if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const cents = Math.round(Number(value) * 100);
  return Number.isSafeInteger(cents) && cents !== 0 ? cents : null;
}

/** Side effects: none. Parses a decimal positive whole-number unit count. */
export function parsePositiveWholeUnits(value: string): number | null {
  const normalized = value.trim();
  if (!/^[1-9]\d*$/.test(normalized)) return null;
  const units = Number(normalized);
  return Number.isSafeInteger(units) ? units : null;
}

/** Side effects: none. Derives fixed-unit goal amounts and display progress. */
export function wealthGoalProgress(completedUnits: number) {
  const boundedUnits = Math.min(WEALTH_GOAL_UNITS, Math.max(0, completedUnits));
  return {
    completedUnits: boundedUnits,
    targetUnits: WEALTH_GOAL_UNITS,
    completedCents: boundedUnits * WEALTH_GOAL_UNIT_CENTS,
    targetCents: WEALTH_GOAL_UNITS * WEALTH_GOAL_UNIT_CENTS,
    percent: boundedUnits / WEALTH_GOAL_UNITS * 100,
    remainingUnits: WEALTH_GOAL_UNITS - boundedUnits,
  };
}
