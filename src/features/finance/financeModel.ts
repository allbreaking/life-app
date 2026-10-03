import { z } from 'zod';

export type BudgetAlert = 'normal' | 'amber' | 'crimson';

export type TransactionKind = 'necessary' | 'unnecessary' | 'approved' | 'income';
export type BillKindFilter = 'all' | TransactionKind;
export type BillRange = 'all' | 'today' | '7d' | 'month' | 'custom';

export type Transaction = {
  id: string;
  amountCents: number;
  note: string;
  kind: TransactionKind;
  occurredAt: string;
};

export type SubscriptionTone = 'normal' | 'amber' | 'crimson';

export type Subscription = {
  id: string;
  name: string;
  amountCents: number;
  nextChargeOn: string;
};

export const SUBSCRIPTION_AMBER_DAYS = 3;

/** One-in-one-out trigger keywords for wardrobe purchases. */
export const WARDROBE_KEYWORDS = ['外套', '大衣', '衣服', '上衣', '毛衣', '衬衫', '卫衣', '夹克', '羽绒服', '西装', '裤', '裙', '鞋', '帽', '围巾'];

/** Side effects: none. Reports whether a bill kind consumes the monthly budget. */
export function countsToBudget(kind: TransactionKind): boolean {
  return kind === 'necessary' || kind === 'approved';
}

/** Side effects: none. Detects a wardrobe purchase note that needs a one-in-one-out release. */
export function isWardrobeExpense(note: string): boolean {
  return WARDROBE_KEYWORDS.some((keyword) => note.includes(keyword));
}

export const WEALTH_GOAL_UNITS = 3000;
export const WEALTH_GOAL_UNIT_CENTS = 50_000;

export const budgetCentsSchema = z.number().int().nonnegative();
export const spentCentsSchema = z.number().int().nonnegative();
export const initialBudgetCents = import.meta.env.PROD ? 0 : 300_000;
export const initialSpentCents = import.meta.env.PROD ? 0 : 246_000;

/** Side effects: none. Calculates budget consumption using integer cents. */
export function budgetProgress(spentCents: number, budgetCents: number, now = new Date()) {
  const actualPercent = budgetCents > 0 ? spentCents / budgetCents * 100 : 100;
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const timePercent = ((now.getDate() - 1 + (now.getHours() * 60 + now.getMinutes()) / 1440) / days) * 100;
  const alert: BudgetAlert = actualPercent >= 100 ? 'crimson' : actualPercent > timePercent ? 'amber' : 'normal';
  return { actualPercent, timePercent, leadPercent: actualPercent - timePercent, alert };
}

/** Side effects: none. Derives monthly daily-budget averages from integer cents. */
export function dailyBudgetPlan(spentCents: number, budgetCents: number, now = new Date()) {
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const remainingCents = budgetCents - spentCents;
  const remainingDays = Math.max(1, daysInMonth - now.getDate() + 1);
  return {
    daysInMonth,
    remainingCents,
    remainingDays,
    averagePerDayCents: budgetCents > 0 ? Math.round(budgetCents / daysInMonth) : 0,
    remainingPerDayCents: budgetCents > 0 ? Math.round(remainingCents / remainingDays) : 0,
  };
}

/** Side effects: none. Formats a Date as a local `YYYY-MM-DD` key. */
export function localDateKey(date = new Date()): string {
  return date.toLocaleDateString('sv-SE');
}

/** Side effects: none. Resolves quick time-range presets into inclusive local date bounds. */
export function rangeBounds(range: BillRange, now = new Date()): { from: string; to: string } {
  const today = localDateKey(now);
  if (range === 'today') return { from: today, to: today };
  if (range === '7d') {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    return { from: localDateKey(start), to: today };
  }
  if (range === 'month') return { from: localDateKey(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
  return { from: '', to: '' };
}

/** Side effects: none. Searches bills by note text and filters by kind and inclusive date bounds. */
export function filterTransactions(
  items: readonly Transaction[],
  options: { query?: string; kind?: BillKindFilter; from?: string; to?: string } = {},
): Transaction[] {
  const query = (options.query ?? '').trim().toLowerCase();
  const kind = options.kind ?? 'all';
  const from = options.from ?? '';
  const to = options.to ?? '';
  return items.filter((item) => {
    if (kind !== 'all' && item.kind !== kind) return false;
    if (query && !item.note.toLowerCase().includes(query)) return false;
    if (from && item.occurredAt < from) return false;
    if (to && item.occurredAt > to) return false;
    return true;
  });
}

/** Side effects: none. Resolves a subscription charge date into days remaining, tone, and label. */
export function subscriptionAlert(nextChargeOn: string, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(`${nextChargeOn}T00:00:00`);
  if (Number.isNaN(target.getTime())) return { days: 0, tone: 'normal' as SubscriptionTone, label: '日期无效' };
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { days, tone: 'crimson' as SubscriptionTone, label: `已逾期 ${Math.abs(days)} 天` };
  if (days === 0) return { days, tone: 'crimson' as SubscriptionTone, label: '今天扣费' };
  if (days <= SUBSCRIPTION_AMBER_DAYS) return { days, tone: 'amber' as SubscriptionTone, label: `${days} 天后扣费` };
  return { days, tone: 'normal' as SubscriptionTone, label: `${days} 天后` };
}

/** Side effects: none. Picks the highest alert tone across subscriptions, or null when nothing needs attention. */
export function subscriptionCardTone(items: readonly Subscription[], now = new Date()): SubscriptionTone | null {
  let tone: SubscriptionTone | null = null;
  for (const item of items) {
    const candidate = subscriptionAlert(item.nextChargeOn, now).tone;
    if (candidate === 'crimson') return 'crimson';
    if (candidate === 'amber') tone = 'amber';
  }
  return tone;
}

/** Side effects: none. Sums expense and income totals for a visible bill list. */
export function transactionTotals(items: readonly Transaction[]): { spentCents: number; incomeCents: number } {
  return items.reduce((totals, item) => {
    if (item.kind === 'income') totals.incomeCents += item.amountCents;
    else totals.spentCents += Math.abs(item.amountCents);
    return totals;
  }, { spentCents: 0, incomeCents: 0 });
}

/** Side effects: none. Converts a decimal currency string to integer cents. */
export function parseMoneyToCents(value: string): number | null {
  if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const cents = Math.round(Number(value) * 100);
  return Number.isSafeInteger(cents) && cents !== 0 ? cents : null;
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
