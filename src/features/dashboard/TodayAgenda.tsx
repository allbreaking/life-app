import { useState } from 'react';
import { z } from 'zod';
import { useDomainResource } from '../../shared/ipc/useDomainResource';
import { syncTodayCalendar, setReminderCompleted, type CalendarEvent, type ReminderItem, type TodayCalendar } from '../../shared/ipc/calendar';
import { hasTauriRuntime } from '../../shared/ipc/domainResource';
import { todayKey } from './dailyTodos';

const completedEventsSchema = z.record(z.string(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/));
type CompletedEvents = z.infer<typeof completedEventsSchema>;

const formatTime = (seconds: number) =>
  new Date(seconds * 1000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });

const formatDue = (seconds: number) => {
  const date = new Date(seconds * 1000);
  const today = new Date();
  if (date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate()) {
    return `今天 ${formatTime(seconds)}`;
  }
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
};

/** Side effects: syncs and toggles reminders through the macOS EventKit adapter, and keeps event completion in local SQLite state. */
export function TodayAgenda() {
  const [data, setData] = useState<TodayCalendar | null>(null);
  const [synced, setSynced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [completedEvents, setCompletedEvents] = useDomainResource('dashboard.completedEvents', completedEventsSchema, {} as CompletedEvents);

  if (!hasTauriRuntime()) {
    return (
      <section className="card">
        <h2><span>▣ 今日待办</span></h2>
        <p className="small">日历同步仅在 Life-OS 桌面版中可用</p>
      </section>
    );
  }

  const sync = async () => {
    setLoading(true);
    setMessage('');
    try {
      setData(await syncTodayCalendar());
      setSynced(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '同步失败');
    } finally {
      setLoading(false);
    }
  };

  const toggleReminder = async (reminder: ReminderItem) => {
    const next = !reminder.completed;
    setData((current) => current ? {
      ...current,
      reminders: current.reminders.map((item) => item.id === reminder.id ? { ...item, completed: next } : item),
    } : current);
    try {
      await setReminderCompleted(reminder.id, next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '更新失败');
      setData((current) => current ? {
        ...current,
        reminders: current.reminders.map((item) => item.id === reminder.id ? { ...item, completed: reminder.completed } : item),
      } : current);
    }
  };

  const toggleEvent = (event: CalendarEvent) => {
    const today = todayKey();
    setCompletedEvents((current) => {
      const next = { ...current };
      if (next[event.id] === today) delete next[event.id];
      else next[event.id] = today;
      return next;
    });
  };

  const isEventDone = (event: CalendarEvent) => completedEvents[event.id] === todayKey();
  const eventCount = data?.events.length ?? 0;
  const reminderCount = data?.reminders.length ?? 0;

  return (
    <section className="card">
      <h2>
        <span>▣ 今日待办</span>
        <button className="command-button" onClick={() => void sync()} disabled={loading} aria-label="同步日历日程与提醒事项">
          {loading ? '同步中…' : synced ? '重新同步' : '同步日历'}
        </button>
      </h2>

      {message && <p className="status-message" role="status">{message}</p>}

      {!synced && !loading && <p className="small">点击右上角「同步日历」，读取今天的日程和提醒事项。</p>}

      {data && !data.eventsAuthorized && <p className="small">未授权访问日历，请在系统设置中允许 Life-OS 访问日历。</p>}
      {data && data.eventsAuthorized && (
        <AgendaGroup label="日程">
          {eventCount === 0 ? <p className="small">今天没有日程</p> : data.events.map((event) => <EventRow event={event} done={isEventDone(event)} onToggle={toggleEvent} key={event.id} />)}
        </AgendaGroup>
      )}

      {data && !data.remindersAuthorized && <p className="small">未授权访问提醒事项，请在系统设置中允许 Life-OS 访问提醒事项。</p>}
      {data && data.remindersAuthorized && (
        <AgendaGroup label="提醒事项">
          {reminderCount === 0 ? <p className="small">没有待处理提醒</p> : data.reminders.map((reminder) => <ReminderRow reminder={reminder} onToggle={toggleReminder} key={reminder.id} />)}
        </AgendaGroup>
      )}
    </section>
  );
}

/** Side effects: none. */
function AgendaGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 10 }}>
      <p className="small" style={{ margin: '4px 0' }}>{label}</p>
      {children}
    </div>
  );
}

/** Side effects: none. */
function EventRow({ event, done, onToggle }: { event: CalendarEvent; done: boolean; onToggle: (event: CalendarEvent) => void }) {
  const time = event.allDay
    ? '全天'
    : event.start != null
      ? `${formatTime(event.start)}${event.end != null ? ` – ${formatTime(event.end)}` : ''}`
      : '';
  return (
    <div className={done ? 'todo-row done' : 'todo-row'}>
      <button type="button" className="todo-check" onClick={() => onToggle(event)} aria-pressed={done} aria-label={done ? `取消完成 ${event.title}` : `完成 ${event.title}`}>✓</button>
      <span className="todo-title">{time ? `${time}　${event.title}` : event.title}</span>
      {event.calendar && <span className="small">{event.calendar}</span>}
    </div>
  );
}

/** Side effects: delegates the completion toggle to the parent. */
function ReminderRow({ reminder, onToggle }: { reminder: ReminderItem; onToggle: (reminder: ReminderItem) => void }) {
  return (
    <div className={reminder.completed ? 'todo-row done' : 'todo-row'}>
      <button type="button" className="todo-check" onClick={() => onToggle(reminder)} aria-pressed={reminder.completed} aria-label={reminder.completed ? `取消完成 ${reminder.title}` : `完成 ${reminder.title}`}>✓</button>
      <span className="todo-title">{reminder.title}</span>
      {reminder.due != null && <span className="small">{formatDue(reminder.due)}</span>}
      {reminder.calendar && <span className="small">{reminder.calendar}</span>}
    </div>
  );
}
