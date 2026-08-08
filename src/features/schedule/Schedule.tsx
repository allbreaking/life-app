import { useMemo, useState, type DragEvent, type FormEvent } from 'react';
import { z } from 'zod';
import { useDomainResource } from '../../shared/ipc/useDomainResource';
import { lifeTemplateOccursOn, minutesToTime, snapToQuarterHour, type Frequency, type LifeTemplate } from './scheduleModel';

type View = 'day' | 'week' | 'month';
type PoolTask = { id: string; title: string; module: 'work' | 'learning' | 'items' | 'network'; quadrant?: string };
type ScheduledTask = PoolTask & { date: string; time: string; duration: number; editable: true };
type LifeSchedule = LifeTemplate & { id: string; title: string; time: string; label: string; editable: false };

const todayKey = () => new Date().toLocaleDateString('sv-SE');
const initialPool: PoolTask[] = [
  { id: 'work-q1', title: '客户环境部署修复', module: 'work', quadrant: 'Q1' }, { id: 'work-q2', title: '交易观察列表安全价逻辑', module: 'work', quadrant: 'Q2' },
  { id: 'work-q3', title: '填报本月报销单', module: 'work', quadrant: 'Q3' }, { id: 'work-q4', title: '整理旧项目归档', module: 'work', quadrant: 'Q4' },
  { id: 'learn-1', title: '阅读《估值的艺术》第3章', module: 'learning' }, { id: 'item-1', title: '咖啡豆库存补充', module: 'items' }, { id: 'network-1', title: '老王生日礼物准备', module: 'network' },
];
const initialLife: LifeSchedule[] = [
  { id: 'life-1', title: '晨间拉伸', time: '07:30', frequency: 'daily', label: '每天', editable: false },
  { id: 'life-2', title: '芭蕾课', time: '19:00', frequency: 'weekly', weekday: new Date().getDay(), label: '每周', editable: false },
];
const moduleNames = { work: '工作', learning: '学习', items: '物品', network: '社交' } as const;
const poolTaskSchema = z.object({ id: z.string().min(1).max(100), title: z.string().min(1).max(200), module: z.enum(['work', 'learning', 'items', 'network']), quadrant: z.string().max(2).optional() }).strict();
const scheduledTaskSchema = poolTaskSchema.extend({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^\d{2}:\d{2}$/), duration: z.number().int().min(15).max(480), editable: z.literal(true) }).strict();
const lifeScheduleSchema = z.object({ id: z.string().min(1).max(100), title: z.string().min(1).max(200), time: z.string().regex(/^\d{2}:\d{2}$/), frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly']), weekday: z.number().int().min(0).max(6).optional(), monthDay: z.number().int().min(1).max(31).optional(), anchorDate: z.string().optional(), label: z.string().max(20), editable: z.literal(false) }).strict();

/** Side effects: persists scheduling and life-template changes through typed IPC to SQLite; view state remains local. */
export function Schedule() {
  const [view, setView] = useState<View>('day');
  const [pool, setPool] = useDomainResource('schedule.pool', z.array(poolTaskSchema), initialPool);
  const [scheduled, setScheduled] = useDomainResource('schedule.scheduled', z.array(scheduledTaskSchema), [] as ScheduledTask[]);
  const [lifeSchedules, setLifeSchedules] = useDomainResource('schedule.lifeSchedules', z.array(lifeScheduleSchema), initialLife);
  const [previewDate, setPreviewDate] = useState(todayKey);
  const [message, setMessage] = useState('');
  const projectedLife = useMemo(() => lifeSchedules.filter((item) => lifeTemplateOccursOn(item, new Date(`${previewDate}T12:00:00`))).sort((a, b) => a.time.localeCompare(b.time)), [lifeSchedules, previewDate]);

  const scheduleTask = (id: string, minuteOffset = 9 * 60) => {
    const task = pool.find((item) => item.id === id); if (!task) return;
    setPool((items) => items.filter((item) => item.id !== id));
    setScheduled((items) => [...items, { ...task, date: previewDate, time: minutesToTime(minuteOffset), duration: 60, editable: true }]);
    setMessage(`已临时排期到 ${previewDate} ${minutesToTime(minuteOffset)}`);
  };
  const unscheduleTask = (id: string) => {
    const task = scheduled.find((item) => item.id === id); if (!task) return;
    const { date: _date, time: _time, duration: _duration, editable: _editable, ...poolTask } = task;
    setScheduled((items) => items.filter((item) => item.id !== id)); setPool((items) => [...items, poolTask]); setMessage('已撤销排期并还原到任务池');
  };
  const extendTask = (id: string) => {
    setScheduled((items) => items.map((item) => item.id === id ? { ...item, duration: Math.min(item.duration + 15, 8 * 60) } : item));
    setMessage('任务时长已按 15 分钟增加');
  };
  const onDropCanvas = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); const id = event.dataTransfer.getData('text/plain'); const rect = event.currentTarget.getBoundingClientRect(); const minutes = 6 * 60 + ((event.clientY - rect.top) / Math.max(rect.height, 1)) * 16 * 60; scheduleTask(id, snapToQuarterHour(minutes)); };
  const addLifeTemplate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget); const title = String(data.get('title') ?? '').trim(); const frequency = String(data.get('frequency')) as Frequency; const time = String(data.get('time'));
    const monthDay = Number(data.get('monthDay')); const weekday = Number(data.get('weekday')); if (!title || title.length > 200 || !time || !['daily', 'weekly', 'biweekly', 'monthly'].includes(frequency) || (frequency === 'monthly' && (monthDay < 1 || monthDay > 31))) return setMessage('请填写有效的生活日程模板');
    const labels = { daily: '每天', weekly: '每周', biweekly: '每两周', monthly: '每月' } as const;
    setLifeSchedules((items) => [...items, { id: crypto.randomUUID(), title, frequency, time, weekday, monthDay, anchorDate: todayKey(), label: labels[frequency], editable: false }]); event.currentTarget.reset(); setMessage('生活模板已加入本次运行；日历投影保持只读');
  };

  return <div className="schedule-view">
    <section className="card schedule-switcher"><div className="schedule-tabs" role="tablist">{(['day', 'week', 'month'] as View[]).map((item) => <button role="tab" aria-selected={view === item} className={view === item ? 'active' : ''} onClick={() => setView(item)} key={item}>{item === 'day' ? '日视图' : item === 'week' ? '周视图' : '月视图'}</button>)}</div><p className="small">日程模块拥有唯一排期权 — 其余模块只生产任务，由此处手动拖入具体时间</p></section>
    {message && <div className="status-message" role="status">{message}</div>}
    <div className="grid schedule-layout">
      <section className="card schedule-canvas-card">
        {view === 'day' && <DayCanvas scheduled={scheduled.filter((item) => item.date === previewDate)} life={projectedLife} onDrop={onDropCanvas} onUnschedule={unscheduleTask} onExtend={extendTask} />}
        {view === 'week' && <WeekView scheduled={scheduled} />}
        {view === 'month' && <MonthView scheduled={scheduled} />}
      </section>
      <TaskPool tasks={pool} onSchedule={scheduleTask} onReturn={unscheduleTask} />
    </div>
    <LifeTemplateManager templates={lifeSchedules} preview={projectedLife} previewDate={previewDate} setPreviewDate={setPreviewDate} onSubmit={addLifeTemplate} />
  </div>;
}

/** Side effects: invokes scheduling callbacks and supplies drag payloads. */
function TaskPool({ tasks, onSchedule, onReturn }: { tasks: PoolTask[]; onSchedule: (id: string) => void; onReturn: (id: string) => void }) {
  return <section className="card task-pool" onDragOver={(event) => event.preventDefault()} onDrop={(event) => onReturn(event.dataTransfer.getData('text/plain'))}><h2><span>待排期池</span><span className="tag">按来源模块</span></h2>{(Object.keys(moduleNames) as PoolTask['module'][]).map((module) => { const moduleTasks = tasks.filter((task) => task.module === module); return <section className="pool-group" key={module}><h3>{moduleNames[module]} <span>{moduleTasks.length}</span></h3>{moduleTasks.map((task) => <div className="pool-task" draggable onDragStart={(event) => event.dataTransfer.setData('text/plain', task.id)} key={task.id}><span>{task.title}</span><span>{task.quadrant && <b>{task.quadrant}</b>}<button aria-label={`排期 ${task.title}`} onClick={() => onSchedule(task.id)}>排到 09:00</button></span></div>)}</section>; })}<p className="small">拖动到左侧排期；已排期任务可拖回此处。</p></section>;
}

/** Side effects: accepts drop events and invokes unschedule callback. */
function DayCanvas({ scheduled, life, onDrop, onUnschedule, onExtend }: { scheduled: ScheduledTask[]; life: LifeSchedule[]; onDrop: (event: DragEvent<HTMLDivElement>) => void; onUnschedule: (id: string) => void; onExtend: (id: string) => void }) {
  return <><h2><span>今日时间轴</span><span className="tag">15 分钟吸附 · 生活日程只读</span></h2><div className="day-board" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>{Array.from({ length: 17 }, (_, index) => <span className="time-mark" style={{ top: `${index * 60}px` }} key={index}>{String(index + 6).padStart(2, '0')}:00</span>)}{life.map((item) => <div className="calendar-event life-event" style={{ top: `${(Number(item.time.slice(0, 2)) - 6) * 60 + Number(item.time.slice(3))}px` }} key={item.id}><span>{item.time} {item.title}</span><em>生活模板 · 只读</em></div>)}{scheduled.map((task) => <div className={`calendar-event module-${task.module}`} draggable onDragStart={(event) => event.dataTransfer.setData('text/plain', task.id)} style={{ top: `${(Number(task.time.slice(0, 2)) - 6) * 60 + Number(task.time.slice(3))}px`, height: `${task.duration}px` }} key={task.id}><span>{task.time} {task.title}</span><button aria-label={`撤销排期 ${task.title}`} onClick={() => onUnschedule(task.id)}>退回池</button><button className="event-resize" aria-label={`增加 ${task.title} 时长 15 分钟`} onClick={() => onExtend(task.id)} /></div>)}</div></>;
}

/** Side effects: none. */
function WeekView({ scheduled }: { scheduled: ScheduledTask[] }) { const start = new Date(); start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); return <><h2>本周安排</h2><div className="week-grid">{Array.from({ length: 7 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); const key = date.toLocaleDateString('sv-SE'); return <div className="week-day" key={key}><strong>{['一', '二', '三', '四', '五', '六', '日'][index]} · {date.getMonth() + 1}/{date.getDate()}</strong>{scheduled.filter((item) => item.date === key).map((item) => <span key={item.id}>{item.time} {item.title}</span>)}</div>; })}</div></>; }

/** Side effects: none. */
function MonthView({ scheduled }: { scheduled: ScheduledTask[] }) { const now = new Date(); const first = new Date(now.getFullYear(), now.getMonth(), 1); const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7)); return <><h2>本月概览</h2><div className="month-grid">{['一', '二', '三', '四', '五', '六', '日'].map((day) => <strong key={day}>{day}</strong>)}{Array.from({ length: 42 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); const key = date.toLocaleDateString('sv-SE'); return <div className={date.getMonth() === now.getMonth() ? 'month-day' : 'month-day muted'} key={key}><span>{date.getDate()}</span>{scheduled.filter((item) => item.date === key).slice(0, 2).map((item) => <small key={item.id}>{item.title}</small>)}</div>; })}</div></>; }

/** Side effects: invokes controlled date and form callbacks; no direct external writes. */
function LifeTemplateManager({ templates, preview, previewDate, setPreviewDate, onSubmit }: { templates: LifeSchedule[]; preview: LifeSchedule[]; previewDate: string; setPreviewDate: (date: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) { return <section className="card life-manager"><h2><span>新增生活日程</span><span className="tag">模块内录入 · 重复日程</span></h2><form onSubmit={onSubmit}><input name="title" maxLength={200} required placeholder="事件名称" /><select name="frequency" defaultValue="daily"><option value="daily">每天</option><option value="weekly">每周</option><option value="biweekly">每两周</option><option value="monthly">每月</option></select><select name="weekday" defaultValue={new Date().getDay()} aria-label="星期"><option value="1">周一</option><option value="2">周二</option><option value="3">周三</option><option value="4">周四</option><option value="5">周五</option><option value="6">周六</option><option value="0">周日</option></select><input name="monthDay" type="number" min="1" max="31" defaultValue="1" aria-label="每月日期" /><input name="time" type="time" defaultValue="09:00" required aria-label="开始时间" /><button className="command-button" type="submit">添加生活日程</button></form><p className="small life-caption">已创建的生活日程模板 · 仅可在模板管理区修改或删除</p>{templates.map((item) => <div className="life-template-row" key={item.id}><span className="mono">{item.time}</span><strong>{item.title}</strong><span className="chip amber">{item.label}</span><span className="small">日历中只读</span></div>)}<div className="life-preview-head"><span className="small">当日生活时间线</span><input type="date" aria-label="预览日期" value={previewDate} onChange={(event) => setPreviewDate(event.target.value)} /></div><div className="timeline">{preview.length ? preview.map((item) => <div className="timeline-item" key={item.id}><div className="timeline-meta">{item.time}</div><div className="timeline-title">{item.title} <span className="chip amber">{item.label}</span></div></div>) : <p className="small">这一天还没有生活日程</p>}</div></section>; }
