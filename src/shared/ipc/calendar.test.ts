import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setReminderCompleted, syncTodayCalendar } from './calendar';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

beforeEach(() => {
  invoke.mockReset();
  Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} });
});

describe('syncTodayCalendar', () => {
  it('validates the returned calendar snapshot', async () => {
    invoke.mockResolvedValue({
      events: [{ id: 'e1', title: '会议', calendar: '工作', start: 1, end: 2, allDay: false }],
      reminders: [{ id: 'r1', title: '买牛奶', calendar: '家庭', due: 3, completed: false }],
      eventsAuthorized: true,
      remindersAuthorized: true,
    });
    const result = await syncTodayCalendar();
    expect(result.events).toHaveLength(1);
    expect(result.reminders[0].completed).toBe(false);
    expect(invoke).toHaveBeenCalledWith('sync_today_calendar');
  });

  it('rejects malformed payloads with a friendly message', async () => {
    invoke.mockResolvedValue({ events: 'not-an-array', reminders: [], eventsAuthorized: true, remindersAuthorized: true });
    await expect(syncTodayCalendar()).rejects.toThrow();
  });

  it('fails outside the Tauri runtime', async () => {
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
    await expect(syncTodayCalendar()).rejects.toThrow('仅在 Life-OS 桌面版中可用');
  });
});

describe('setReminderCompleted', () => {
  it('invokes the toggle command with the stable id and flag', async () => {
    invoke.mockResolvedValue(undefined);
    await setReminderCompleted('r1', true);
    expect(invoke).toHaveBeenCalledWith('set_reminder_completed', { id: 'r1', completed: true });
  });
});
