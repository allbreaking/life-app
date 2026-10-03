import { expect, test } from 'vitest';
import { budgetProgress, countsToBudget, dailyBudgetPlan, filterTransactions, isWardrobeExpense, localDateKey, parseMoneyToCents, rangeBounds, subscriptionAlert, subscriptionCardTone, transactionTotals, wealthGoalProgress, type Subscription, type Transaction } from './financeModel';

test('parses money as integer cents and rejects unsafe input', () => {
  expect(parseMoneyToCents('-35.20')).toBe(-3520);
  expect(parseMoneyToCents('12.345')).toBeNull();
  expect(parseMoneyToCents('0')).toBeNull();
});

test('uses amber when consumption leads time and crimson at 100 percent', () => {
  const now = new Date('2026-08-16T12:00:00');
  expect(budgetProgress(60_000, 100_000, now).alert).toBe('amber');
  expect(budgetProgress(100_000, 100_000, now).alert).toBe('crimson');
});

test('derives dynamic monthly daily-budget averages', () => {
  const now = new Date('2026-08-16T09:00:00');
  expect(dailyBudgetPlan(100_000, 310_000, now)).toEqual({
    daysInMonth: 31,
    remainingCents: 210_000,
    remainingDays: 16,
    averagePerDayCents: 10_000,
    remainingPerDayCents: 13_125,
  });
  expect(dailyBudgetPlan(0, 0, now).averagePerDayCents).toBe(0);
});

test('resolves quick time-range presets into inclusive local date bounds', () => {
  const now = new Date('2026-08-16T12:00:00');
  expect(rangeBounds('all', now)).toEqual({ from: '', to: '' });
  expect(rangeBounds('today', now)).toEqual({ from: '2026-08-16', to: '2026-08-16' });
  expect(rangeBounds('7d', now)).toEqual({ from: '2026-08-10', to: '2026-08-16' });
  expect(rangeBounds('month', now)).toEqual({ from: '2026-08-01', to: '2026-08-16' });
  expect(localDateKey(now)).toBe('2026-08-16');
});

test('searches and filters bills by note, kind, and inclusive dates', () => {
  const bills: Transaction[] = [
    { id: 'b1', amountCents: -3500, note: '买猫粮', kind: 'necessary', occurredAt: '2026-08-16' },
    { id: 'b2', amountCents: -12800, note: '蓝牙耳机', kind: 'unnecessary', occurredAt: '2026-08-10' },
    { id: 'b3', amountCents: 2_000_000, note: '工资', kind: 'income', occurredAt: '2026-08-01' },
  ];
  expect(filterTransactions(bills).map((item) => item.id)).toEqual(['b1', 'b2', 'b3']);
  expect(filterTransactions(bills, { query: '耳机' }).map((item) => item.id)).toEqual(['b2']);
  expect(filterTransactions(bills, { kind: 'necessary' }).map((item) => item.id)).toEqual(['b1']);
  expect(filterTransactions(bills, { from: '2026-08-10', to: '2026-08-16' }).map((item) => item.id)).toEqual(['b1', 'b2']);
  expect(transactionTotals(bills)).toEqual({ spentCents: 16_300, incomeCents: 2_000_000 });
});

test('counts only necessary and approved bills against the budget', () => {
  expect(countsToBudget('necessary')).toBe(true);
  expect(countsToBudget('approved')).toBe(true);
  expect(countsToBudget('unnecessary')).toBe(false);
  expect(countsToBudget('income')).toBe(false);
});

test('detects wardrobe purchase notes for the one-in-one-out rule', () => {
  expect(isWardrobeExpense('买新外套')).toBe(true);
  expect(isWardrobeExpense('换季衣服')).toBe(true);
  expect(isWardrobeExpense('运动鞋')).toBe(true);
  expect(isWardrobeExpense('午餐 · 工作餐')).toBe(false);
  expect(isWardrobeExpense('Netflix')).toBe(false);
});

test('grades subscription charge dates into normal, amber, and crimson', () => {
  const now = new Date('2026-10-03T10:00:00');
  expect(subscriptionAlert('2026-10-03', now)).toMatchObject({ days: 0, tone: 'crimson', label: '今天扣费' });
  expect(subscriptionAlert('2026-10-01', now)).toMatchObject({ days: -2, tone: 'crimson' });
  expect(subscriptionAlert('2026-10-06', now)).toMatchObject({ days: 3, tone: 'amber' });
  expect(subscriptionAlert('2026-10-20', now)).toMatchObject({ days: 17, tone: 'normal' });
  expect(subscriptionAlert('加个日期', now).tone).toBe('normal');

  const subs: Subscription[] = [
    { id: 's1', name: '视频会员', amountCents: 2500, nextChargeOn: '2026-10-20' },
    { id: 's2', name: '云盘', amountCents: 2100, nextChargeOn: '2026-10-05' },
  ];
  expect(subscriptionCardTone(subs, now)).toBe('amber');
  expect(subscriptionCardTone([...subs, { id: 's3', name: '音乐', amountCents: 1500, nextChargeOn: '2026-10-03' }], now)).toBe('crimson');
  expect(subscriptionCardTone([], now)).toBeNull();
});

test('derives the fixed 500 yuan unit goal progress', () => {
  expect(wealthGoalProgress(1500)).toEqual({
    completedUnits: 1500,
    targetUnits: 3000,
    completedCents: 75_000_000,
    targetCents: 150_000_000,
    percent: 50,
    remainingUnits: 1500,
  });
});
