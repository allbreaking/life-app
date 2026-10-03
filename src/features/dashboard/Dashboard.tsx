import { useDomainResource } from '../../shared/ipc/useDomainResource';
import { dailyTodosSchema, initialDailyOutput, initialDailyTasks } from './dailyTodos';
import { DailyTodoCard } from './DailyTodoCard';
import { TodayAgenda } from './TodayAgenda';
import { foodSchema, initialFoods } from '../items/itemModel';
import { budgetCentsSchema, initialBudgetCents, initialSpentCents, spentCentsSchema } from '../finance/financeModel';
import { initialPeople, peopleSchema } from '../network/networkModel';
import { aggregateAlerts, aggregateImportantDates, alertCardTone } from './dashboardModel';

/** Side effects: persists the two daily todo lists and reads other modules for read-only aggregation. */
export function Dashboard() {
  const [dailyOutput, setDailyOutput] = useDomainResource('dashboard.dailyOutput', dailyTodosSchema, initialDailyOutput);
  const [dailyTasks, setDailyTasks] = useDomainResource('dashboard.dailyTasks', dailyTodosSchema, initialDailyTasks);
  const [foods] = useDomainResource('items.foods', foodSchema, initialFoods);
  const [budgetCents] = useDomainResource('finance.budgetCents', budgetCentsSchema, initialBudgetCents);
  const [spentCents] = useDomainResource('finance.spentCents', spentCentsSchema, initialSpentCents);
  const [people] = useDomainResource('network.people', peopleSchema, initialPeople);

  const alerts = aggregateAlerts({ foods, budgetCents, spentCents, people });
  const importantDates = aggregateImportantDates(people);
  const alertTone = alertCardTone(alerts);

  const dailyCards = (
    <div className="grid grid-2 dashboard-secondary">
      <DailyTodoCard title="每日输出" symbol="✎" hint="每天产出一条内容，隔天自动刷新完成状态" items={dailyOutput} onChange={setDailyOutput} />
      <DailyTodoCard title="地球online日常任务" symbol="⚑" hint="每日日常，隔天自动刷新完成状态" items={dailyTasks} onChange={setDailyTasks} />
    </div>
  );

  return (
    <div className="dashboard-view">
      {!import.meta.env.PROD && (
        <section className="card north-star-card">
          <div className="card-kicker"><span aria-hidden="true">⌾</span> 本月北极星</div>
          <strong>完成 Life-OS 核心机制交付，减少一切伪需求打扰</strong>
          <p className="small">原则提示：倒过来想，总是倒过来想。</p>
        </section>
      )}

      <TodayAgenda />

      {dailyCards}

      <div className="grid grid-2 dashboard-secondary">
        <section className={alertTone ? `card alert-${alertTone}` : 'card'}>
          <h2 className="alert-title"><span aria-hidden="true">△</span> 预警聚合</h2>
          {alerts.length === 0 ? <p className="small">暂无预警</p> : alerts.map((alert) => (
            <DataRow key={alert.id} label={alert.label}><Chip tone={alert.tone}>{alert.module}</Chip></DataRow>
          ))}
        </section>
        <section className="card">
          <h2>即将到来的重要日期</h2>
          {importantDates.length === 0 ? <p className="small">暂无重要日期</p> : importantDates.map((date) => (
            <DataRow key={date.id} label={date.label} />
          ))}
        </section>
      </div>
    </div>
  );
}

/** Side effects: none. */
function DataRow({ label, children }: { label: string; children?: React.ReactNode }) {
  return <div className="data-row"><span>{label}</span>{children}</div>;
}

/** Side effects: none. */
function Chip({ tone, children }: { tone: 'amber' | 'crimson' | 'sky'; children: React.ReactNode }) {
  return <span className={`chip ${tone}`}>{children}</span>;
}
