import { expect, test } from 'vitest';
import { aggregateAlerts, aggregateImportantDates, alertCardTone, type DashboardSources } from './dashboardModel';
import type { Food } from '../items/itemModel';
import type { Person } from '../network/networkModel';

const now = new Date('2026-08-16T12:00:00');

const food = (id: string, expiry: string): Food => ({ id, name: `食物${id}`, location: '冰箱', expiry });

function sources(overrides: Partial<DashboardSources> = {}): DashboardSources {
  return { foods: [], budgetCents: 0, spentCents: 0, people: [], ...overrides };
}

test('aggregates food-expiry and budget alerts with source modules', () => {
  const alerts = aggregateAlerts(sources({
    foods: [food('a', '2026-08-19'), food('b', '2026-08-22'), food('c', '2026-09-10')],
    budgetCents: 300_000,
    spentCents: 246_000,
  }), now);

  expect(alerts).toEqual([
    { id: 'food:a', label: '食物a · 3 天后到期', tone: 'crimson', module: '物品' },
    { id: 'food:b', label: '食物b · 6 天后到期', tone: 'amber', module: '物品' },
    { id: 'budget', label: '本月预算已用 82%，领先时间进度 32%', tone: 'amber', module: '财务' },
  ]);
});

test('skips the budget alert when no budget is configured', () => {
  const alerts = aggregateAlerts(sources({ budgetCents: 0, spentCents: 120 }), now);
  expect(alerts.filter((alert) => alert.module === '财务')).toEqual([]);
});

test('omits foods that are not yet near expiry', () => {
  const alerts = aggregateAlerts(sources({ foods: [food('a', '2026-09-10')] }), now);
  expect(alerts).toEqual([]);
});

test('lists only contacts with a free-text important date', () => {
  const people: Person[] = [
    { id: 'p1', name: '老王', relation: '大学同学', note: '', importantDate: '3天后生日', lastInteraction: '3周前' },
    { id: 'p2', name: '小明', relation: '前同事', note: '', lastInteraction: '昨天' },
  ];
  expect(aggregateImportantDates(people)).toEqual([{ id: 'p1', label: '老王 · 3天后生日' }]);
});

test('derives the card tone from the most severe alert', () => {
  expect(alertCardTone([])).toBeNull();
  expect(alertCardTone([{ id: '1', label: '', tone: 'amber', module: '财务' }])).toBe('amber');
  expect(alertCardTone([{ id: '1', label: '', tone: 'amber', module: '财务' }, { id: '2', label: '', tone: 'crimson', module: '物品' }])).toBe('crimson');
});
