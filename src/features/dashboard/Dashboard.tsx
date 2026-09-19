import { useDomainResource } from '../../shared/ipc/useDomainResource';
import { dailyTodosSchema, initialDailyOutput, initialDailyTasks } from './dailyTodos';
import { DailyTodoCard } from './DailyTodoCard';

/** Side effects: persists the two daily todo lists through typed IPC. */
export function Dashboard() {
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
        <p className="small">今日暂无待办</p>
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

      <section className="card">
        <h2><span>▣ 今日待办</span></h2>
        <p className="small">今日暂无待办</p>
      </section>

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
