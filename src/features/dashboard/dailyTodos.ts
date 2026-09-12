import { z } from 'zod';
import { todayKey } from '../schedule/scheduleState';

/** 每日待办条目：标题 + 完成日期。仅当 completedOn 等于当天日期时视为已完成，隔天自动刷新为未完成。 */
export type DailyTodoItem = { id: string; title: string; completedOn: string | null };

export const dailyTodoItemSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().min(1).max(200),
  completedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
}).strict();

export const dailyTodosSchema = z.array(dailyTodoItemSchema);

export const initialDailyOutput: DailyTodoItem[] = import.meta.env.PROD ? [] : [
  { id: 'out-1', title: '写 500 字复盘', completedOn: null },
  { id: 'out-2', title: '记录一个今日想法', completedOn: null },
  { id: 'out-3', title: '输出一条知识卡片', completedOn: null },
];

export const initialDailyTasks: DailyTodoItem[] = import.meta.env.PROD ? [] : [
  { id: 'task-1', title: '喝水 1.5L', completedOn: null },
  { id: 'task-2', title: '运动 30 分钟', completedOn: null },
  { id: 'task-3', title: '阅读 20 分钟', completedOn: null },
  { id: 'task-4', title: '23:30 前睡觉', completedOn: null },
];

/** Side effects: reads the local system date. */
export function isCompletedToday(item: DailyTodoItem, today = todayKey()): boolean {
  return item.completedOn === today;
}
