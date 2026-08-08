import { z } from 'zod';

export type PoolTask = { id: string; title: string; module: 'work' | 'learning' | 'items' | 'network'; quadrant?: string };
export type ScheduledTask = PoolTask & { date: string; time: string; duration: number; editable: true; completed: boolean };

export const todayKey = () => new Date().toLocaleDateString('sv-SE');

export const poolTaskSchema = z.object({ id: z.string().min(1).max(100), title: z.string().min(1).max(200), module: z.enum(['work', 'learning', 'items', 'network']), quadrant: z.string().max(2).optional() }).strict();
export const scheduledTaskSchema = poolTaskSchema.extend({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^\d{2}:\d{2}$/), duration: z.number().int().min(15).max(480), editable: z.literal(true), completed: z.boolean().default(false) }).strict();
export const scheduledTasksSchema = z.array(scheduledTaskSchema);

export const initialScheduledTasks: ScheduledTask[] = import.meta.env.PROD ? [] : [
  { id: 'today-architecture', title: '#LifeOS 架构梳理', module: 'work', quadrant: 'Q2', date: todayKey(), time: '09:30', duration: 60, editable: true, completed: false },
  { id: 'today-weekly-meeting', title: '项目周例会', module: 'work', quadrant: 'Q1', date: todayKey(), time: '14:00', duration: 60, editable: true, completed: false },
  { id: 'today-ballet', title: '芭蕾课', module: 'learning', date: todayKey(), time: '19:00', duration: 60, editable: true, completed: false },
];

/** Side effects: reads the local system date. */
export function todayScheduledTasks(tasks: ScheduledTask[]): ScheduledTask[] {
  const today = todayKey();
  return tasks.filter((task) => task.date === today).sort((a, b) => a.time.localeCompare(b.time));
}
