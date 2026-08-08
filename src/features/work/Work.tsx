import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { useDomainResource } from '../../shared/ipc/useDomainResource';

type Quadrant = 'Q1' | 'Q2' | 'Q3' | 'Q4';
type Task = { id: string; title: string };

const quadrantMeta: Record<Quadrant, { label: string; tone: string; badge?: string }> = {
  Q1: { label: '重要且紧急', tone: 'q1', badge: '限2件' }, Q2: { label: '重要不紧急', tone: 'q2', badge: '黄金攻坚区' },
  Q3: { label: '紧急不重要', tone: 'q3' }, Q4: { label: '不紧急不重要', tone: 'q4', badge: '7天未动' },
};
const initialTasks: Record<Quadrant, Task[]> = import.meta.env.PROD ? { Q1: [], Q2: [], Q3: [], Q4: [] } : {
  Q1: [{ id: 'q1-1', title: '客户环境部署报错修复' }, { id: 'q1-2', title: '日程排期引擎数据结构' }],
  Q2: [{ id: 'q2-1', title: '交易观察列表安全价逻辑 #LifeOS' }, { id: 'q2-2', title: '学习模块里程碑设计 #LifeOS' }],
  Q3: [{ id: 'q3-1', title: '填报本月报销单' }], Q4: [{ id: 'q4-1', title: '整理旧项目归档文件夹' }],
};
const taskSchema = z.object({ id: z.string().min(1).max(100), title: z.string().min(1).max(200) }).strict();
const tasksSchema = z.object({ Q1: z.array(taskSchema), Q2: z.array(taskSchema), Q3: z.array(taskSchema), Q4: z.array(taskSchema) }).strict();

/** Side effects: persists tasks and focus through typed IPC to SQLite; form visibility remains local. */
export function Work() {
  const [tasks, setTasks] = useDomainResource('work.tasks', tasksSchema, initialTasks);
  const [focusIds, setFocusIds] = useDomainResource('work.focusIds', z.array(z.string().max(100)).max(3), [] as string[]);
  const [openForm, setOpenForm] = useState<Quadrant | null>(null);
  const [message, setMessage] = useState('');

  const addTask = (event: FormEvent<HTMLFormElement>, quadrant: Quadrant) => {
    event.preventDefault();
    const title = String(new FormData(event.currentTarget).get('title') ?? '').trim();
    if (!title || title.length > 200) return setMessage('任务名应为 1–200 个字符');
    if (quadrant === 'Q1' && tasks.Q1.length >= 2) return setMessage('Q1 同时进行不能超过 2 项');
    setTasks((current) => ({ ...current, [quadrant]: [...current[quadrant], { id: crypto.randomUUID(), title }] }));
    setMessage('任务已加入本次运行的临时看板');
    event.currentTarget.reset(); setOpenForm(null);
  };

  const toggleFocus = (task: Task, quadrant: Quadrant) => {
    if (quadrant !== 'Q1' && quadrant !== 'Q2') return;
    setFocusIds((current) => current.includes(task.id) ? current.filter((id) => id !== task.id) : current.length < 3 ? [...current, task.id] : current);
  };

  return (
    <div className="work-view">
      <section className="card work-summary"><div><strong>高杠杆，低负荷</strong><p className="small">今日 Top3 从 Q1+Q2 中手动挑选 · 已选 {focusIds.length}/3{!import.meta.env.PROD && ' · 本周加班 6.5h / 15h'}</p></div>{!import.meta.env.PROD && <div className="progress"><div style={{ width: '43%' }} /></div>}</section>
      {message && <div className="status-message" role="status">{message}</div>}
      <div className="grid grid-2 quadrant-grid">
        {(Object.keys(quadrantMeta) as Quadrant[]).map((quadrant) => {
          const meta = quadrantMeta[quadrant];
          return <section className={`quadrant ${meta.tone}`} key={quadrant}><h2><span>{quadrant} {meta.label}</span><span>{meta.badge && <span className={`chip ${quadrant === 'Q1' ? 'crimson' : quadrant === 'Q2' ? 'sky' : 'amber'}`}>{meta.badge}</span>}<button className="add-button" aria-label={`新增 ${quadrant} 任务`} onClick={() => setOpenForm(openForm === quadrant ? null : quadrant)}>＋</button></span></h2>
            {openForm === quadrant && <form className="inline-form" onSubmit={(event) => addTask(event, quadrant)}><input name="title" maxLength={200} required placeholder="任务名 @优先级 #项目" /><button type="submit">添加任务</button></form>}
            {tasks[quadrant].map((task) => <button className={focusIds.includes(task.id) ? 'task-card selected' : 'task-card'} key={task.id} onClick={() => toggleFocus(task, quadrant)} aria-pressed={focusIds.includes(task.id)}><span>{task.title}</span>{quadrant === 'Q1' && task.id === 'q1-1' && <span className="chip crimson">已延期</span>}</button>)}
          </section>;
        })}
      </div>
      <EodForm />
      {!import.meta.env.PROD && <section className="card"><h2><span>EOD 历史时间轴</span><span className="tag">可回顾</span></h2><div className="timeline"><EodItem date="2026-07-24 · 加班 1.5h" done="完成：SQLite 表结构设计" detail="明天：推进日程排期引擎 · 收获：Tauri IPC 传参用 JSON 字符串更稳定" /><EodItem date="2026-07-23 · 加班 0.5h" done="完成：四象限看板交互调整" detail="明天：SQLite 表结构设计 · 收获：SOP 约束应做数据库外键而非 UI 提示" /></div></section>}
    </div>
  );
}

/** Side effects: persists EOD submission acknowledgement through typed IPC to SQLite. */
function EodForm() {
  const [submitted, setSubmitted] = useDomainResource('work.eodSubmitted', z.boolean(), false);
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setSubmitted(true); };
  return <section className="card eod-card"><h2>EOD 日终总结</h2><form onSubmit={submit}><label>加班时长<input name="hours" inputMode="decimal" pattern="[0-9]+([.][0-9]+)?" placeholder="1.5" /></label><label>完成<input name="done" maxLength={500} required placeholder="今日完成了什么" /></label><label>明天计划<input name="plan" maxLength={500} placeholder="明天推进什么，将直接生成明日待办" /></label><label>收获<input name="gain" maxLength={500} placeholder="今天的收获，存入待筛选池" /></label><button type="submit" className="command-button">提交今日 EOD</button>{submitted && <span className="small" role="status">草稿校验通过；领域服务接入后才会正式保存。</span>}</form></section>;
}

/** Side effects: none. */
function EodItem({ date, done, detail }: { date: string; done: string; detail: string }) { return <div className="timeline-item"><div className="timeline-meta">{date}</div><div className="timeline-title">{done}</div><div className="small">{detail} <span className="chip sky">待周六筛选</span></div></div>; }
