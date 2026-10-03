import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';
import { domainResourceError, hasTauriRuntime } from './domainResource';

const epochSeconds = z.number().int();

const calendarEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  calendar: z.string(),
  start: epochSeconds.nullable(),
  end: epochSeconds.nullable(),
  allDay: z.boolean(),
}).strict();

const reminderItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  calendar: z.string(),
  due: epochSeconds.nullable(),
  completed: z.boolean(),
}).strict();

const todayCalendarSchema = z.object({
  events: z.array(calendarEventSchema),
  reminders: z.array(reminderItemSchema),
  eventsAuthorized: z.boolean(),
  remindersAuthorized: z.boolean(),
}).strict();

export type CalendarEvent = z.infer<typeof calendarEventSchema>;
export type ReminderItem = z.infer<typeof reminderItemSchema>;
export type TodayCalendar = z.infer<typeof todayCalendarSchema>;

/** Side effects: invokes the macOS EventKit adapter, which may show the calendar/reminders access prompt on first use. */
export async function syncTodayCalendar(): Promise<TodayCalendar> {
  if (!hasTauriRuntime()) throw new Error('日历同步仅在 Life-OS 桌面版中可用');
  try {
    return todayCalendarSchema.parse(await invoke('sync_today_calendar'));
  } catch (error) {
    throw new Error(domainResourceError(error));
  }
}

/** Side effects: toggles one reminder's completion and writes it back to the macOS calendar. */
export async function setReminderCompleted(id: string, completed: boolean): Promise<void> {
  if (!hasTauriRuntime()) throw new Error('日历同步仅在 Life-OS 桌面版中可用');
  try {
    await invoke('set_reminder_completed', { id, completed });
  } catch (error) {
    throw new Error(domainResourceError(error));
  }
}
