import { z } from 'zod';

export type ExpiryTone = 'crimson' | 'amber' | 'normal';

export const ITEM_TYPES = ['消耗品', '保养品', '使用时期', '固定资产'] as const;
export const ALL_ITEM_TYPES = [...ITEM_TYPES, '食物'] as const;
export type ItemType = (typeof ALL_ITEM_TYPES)[number];
export type Item = { id: string; name: string; type: ItemType; location: string; detail: string };

export type Food = { id: string; name: string; location: string; expiry: string };

export const itemSchema = z.array(z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  type: z.enum(ALL_ITEM_TYPES),
  location: z.string().min(1).max(200),
  detail: z.string().max(500),
}).strict());

export const initialItems: Item[] = import.meta.env.PROD ? [] : [
  { id: 'i1', name: '净水器滤芯', type: '保养品', location: '厨房水槽下', detail: '上次更换：62 天前 · 周期 90 天' },
  { id: 'i2', name: 'MacBook Pro', type: '固定资产', location: '书房', detail: '购入：2024-03 · 保修至 2027-03' },
];

export const foodSchema = z.array(z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  location: z.string().min(1).max(200),
  expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict());

export const initialFoods: Food[] = import.meta.env.PROD ? [] : [
  { id: 'f1', name: '鲜牛奶', location: '冰箱冷藏层', expiry: '2026-08-04' },
  { id: 'f2', name: '鸡蛋', location: '冰箱蛋架', expiry: '2026-08-18' },
];

/** Side effects: none. Uses local calendar dates to avoid timezone boundary drift. */
export function foodExpiryStatus(expiry: string, today = new Date()) {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  const end = new Date(`${expiry}T12:00:00`);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  const tone: ExpiryTone = days <= 3 ? 'crimson' : days <= 7 ? 'amber' : 'normal';
  const label = days < 0 ? `已过期 ${Math.abs(days)} 天` : days === 0 ? '今天到期' : `${days} 天后到期`;
  return { days, tone, label };
}
