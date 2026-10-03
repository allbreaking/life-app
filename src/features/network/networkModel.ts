import { z } from 'zod';

export type Person = { id: string; name: string; relation: string; note: string; importantDate?: string; lastInteraction: string };

export const peopleSchema = z.array(z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  relation: z.string().max(100),
  note: z.string().max(500),
  importantDate: z.string().max(100).optional(),
  lastInteraction: z.string().max(100),
}).strict());

export const initialPeople: Person[] = import.meta.env.PROD ? [] : [
  { id: 'n1', name: '老王', relation: '大学同学', lastInteraction: '3周前', importantDate: '3天后生日', note: '偏好：不吃香菜，喜欢手冲咖啡 · 上次聊到想学 Rust' },
  { id: 'n2', name: '小明', relation: '前同事', lastInteraction: '昨天', note: '推荐了《罗杰疑案》，猫叫“咪咪”' },
];
