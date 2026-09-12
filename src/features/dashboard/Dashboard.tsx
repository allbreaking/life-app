import type { Dispatch, SetStateAction } from 'react';
import { todayScheduledTasks, type ScheduledTask } from '../schedule/scheduleState';
import { useDomainResource } from '../../shared/ipc/useDomainResource';
import { dailyTodosSchema, initialDailyOutput, initialDailyTasks } from './dailyTodos';
import { DailyTodoCard } from './DailyTodoCard';

/** Side effects: invokes the provided scheduled-task setter and persists the two daily todo lists through typed IPC. */
export function Dashboard({ scheduled, setScheduled }: { scheduled: ScheduledTask[]; setScheduled: Dispatch<SetStateAction<ScheduledTask[]>> }) {
  const todos = todayScheduledTasks(scheduled);
  const toggleTodo = (id: string) => setScheduled((items) => items.map((item) => item.id === id ? { ...item, completed: !item.completed } : item));
  const [dailyOutput, setDailyOutput] = useDomainResource('dashboard.dailyOutput', dailyTodosSchema, initialDailyOutput);
  const [dailyTasks, setDailyTasks] = useDomainResource('dashboard.dailyTasks', dailyTodosSchema, initialDailyTasks);

  const dailyCards = (
    <div className="grid grid-2 dashboard-secondary">
      <DailyTodoCard title="每日输出" symbol="✎" hint="每天产出一条内容，隔天自动刷新完成状态" items={dailyOutput} onChange={setDailyOutput} />
      <DailyTodoCard title="地球online日常任务" symbol="⚑" hint="每日日常，隔天自动刷新完成状态" items={dailyTasks} onChange={setDailyTasks} />
    </div>
  );

  if (import.meta.env.PROD) return (
    <div className="dashboard-view">
      <section className="card">
        <h2><span>▣ 今日待办</span></h2>
        {todos.length ? todos.map((todo) => <button className={todo.completed ? 'todo-row done' : 'todo-row'} key={todo.id} onClick={() => toggleTodo(todo.id)}><span className="todo-time">{todo.time}</span><span className="todo-check" aria-hidden="true">✓</span><span className="todo-title">{todo.title}</span></button>) : <p className="small">今日暂无待办</p>}
      </section>
      {dailyCards}
    </div>
  );

  return (
    <div className="dashboard-view">
      <section className="card north-star-card">
        <div className="card-kicker"><span aria-hidden="true">⌾</span> 本月北极星</div>
        <strong>完成 Life-OS 核心机制交付，减少一切伪需求打扰</strong>
        <p className="small">原则提示：倒过来想，总是倒过来想。</p>
      </section>

      <div className="grid grid-2">
        <section className="card">
          <h2><span>▣ 今日待办</span><span className="tag">默认展示3个未完成项</span></h2>
          {todos.map((todo) => (
            <button className={todo.completed ? 'todo-row done' : 'todo-row'} key={todo.id} onClick={() => toggleTodo(todo.id)}>
              <span className="todo-time">{todo.time}</span>
              <span className="todo-check" aria-hidden="true">✓</span>
              <span className="todo-title">{todo.title}</span>
            </button>
          ))}
        </section>

        <section className="card">
          <h2>本周投入统计</h2>
          <DataRow label="加班累计"><span className="mono">6.5h / 15h</span></DataRow>
          <DataRow label="学习任务完成"><span className="mono">4 个</span></DataRow>
          <DataRow label="学习时长"><span className="mono">3.2h</span></DataRow>
        </section>
      </div>

      {dailyCards}

      <div className="grid grid-2 dashboard-secondary">
        <section className="card alert-crimson">
          <h2 className="alert-title"><span aria-hidden="true">△</span> 预警聚合</h2>
          <DataRow label="猫粮预计 3 天后耗尽"><Chip tone="amber">物品</Chip></DataRow>
          <DataRow label="本月预算已用 82%"><Chip tone="amber">财务</Chip></DataRow>
          <DataRow label="600519 触及安全价"><Chip tone="crimson">投资</Chip></DataRow>
        </section>
        <section className="card">
          <h2>即将到来的重要日期</h2>
          <DataRow label="老王 生日"><Chip tone="amber">3 天后</Chip></DataRow>
          <DataRow label="妈妈 体检复诊"><Chip tone="sky">9 天后</Chip></DataRow>
        </section>
      </div>
    </div>
  );
}

/** Side effects: none. */
function DataRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="data-row"><span>{label}</span>{children}</div>;
}

/** Side effects: none. */
function Chip({ tone, children }: { tone: 'amber' | 'crimson' | 'sky'; children: React.ReactNode }) {
  return <span className={`chip ${tone}`}>{children}</span>;
}
