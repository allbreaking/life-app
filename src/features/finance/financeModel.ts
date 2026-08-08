export type BudgetAlert = 'normal' | 'amber' | 'crimson';

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
