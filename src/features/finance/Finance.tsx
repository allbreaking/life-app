import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { useDomainResource } from '../../shared/ipc/useDomainResource';
import { budgetProgress, parseMoneyToCents } from './financeModel';

type Pending = { id: string; note: string; amountCents: number };
const pendingSchema = z.array(z.object({ id: z.string().min(1).max(100), note: z.string().min(1).max(200), amountCents: z.number().int().positive() }).strict());
const transactionSchema = z.object({ amount: z.number().int(), note: z.string().min(1).max(240) }).strict().nullable();
const money = (cents: number) => `¥${(cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Side effects: persists budget and transaction state through typed IPC to SQLite; the necessary/optional switch remains local. */
export function Finance() {
  const [budgetCents, setBudgetCents] = useDomainResource('finance.budgetCents', z.number().int().nonnegative(), import.meta.env.PROD ? 0 : 300_000);
  const [spentCents, setSpentCents] = useDomainResource('finance.spentCents', z.number().int().nonnegative(), import.meta.env.PROD ? 0 : 246_000);
  const [pending, setPending] = useDomainResource('finance.pending', pendingSchema, (import.meta.env.PROD ? [] : [{ id: 'p1', note: '蓝牙耳机（想换新的，非必需）', amountCents: 12_800 }]) as Pending[]);
  const [necessary, setNecessary] = useState(true);
  const [lastTransaction, setLastTransaction] = useDomainResource('finance.lastTransaction', transactionSchema, import.meta.env.PROD ? null : { amount: -3500, note: '买猫粮 · 自动归类 #宠物耗材' });
  const [message, setMessage] = useState('');
  const progress = budgetProgress(spentCents, budgetCents);

  const submitTransaction = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget); const amount = parseMoneyToCents(String(data.get('amount') ?? '')); const note = String(data.get('note') ?? '').trim();
    if (amount === null || !note || note.length > 200) return setMessage('请输入有效金额和 1–200 字备注');
    if (!necessary && amount < 0) { setPending((items) => [...items, { id: crypto.randomUUID(), note, amountCents: Math.abs(amount) }]); setMessage('非必要支出已进入月末评估队列'); }
    else { if (amount < 0) setSpentCents((value) => value + Math.abs(amount)); setLastTransaction({ amount, note: `${note} · 自动归类` }); setMessage('账目已加入本次运行状态'); }
    event.currentTarget.reset();
  };
  const settle = () => { const pendingTotal = pending.reduce((sum, item) => sum + item.amountCents, 0); const surplus = budgetCents - spentCents; if (!pending.length) return setMessage('本月没有待评估支出'); if (surplus >= pendingTotal) { setSpentCents((value) => value + pendingTotal); setPending([]); setMessage(`预算有盈余，已临时放行 ${money(pendingTotal)}`); } else setMessage(`预算结余 ${money(Math.max(0, surplus))}，不足以覆盖 ${money(pendingTotal)}`); };

  if (import.meta.env.PROD) return <div className="finance-view"><div className="grid finance-overview"><section className={`card budget-card alert-${progress.alert}`}><h2>月度预算</h2><div className="metric">{money(spentCents)} / <button aria-label="修改月度预算" onClick={() => setBudgetCents(350_000)}>{money(budgetCents)}</button></div></section><section className="card"><h2>最近交易</h2>{lastTransaction ? <><div className="metric">{lastTransaction.amount < 0 ? '-' : '+'}{money(Math.abs(lastTransaction.amount))}</div><p className="small">{lastTransaction.note}</p></> : <p className="small">暂无交易</p>}</section></div>{message && <div className="status-message" role="status">{message}</div>}<section className="card finance-form-card"><h2>快捷记账</h2><form onSubmit={submitTransaction}><input name="amount" inputMode="decimal" required placeholder="金额，如 -35 或 +200" /><input name="note" maxLength={200} required placeholder="备注" /><div className="type-switch"><button type="button" className={necessary ? 'selected' : ''} onClick={() => setNecessary(true)}>必要支出</button><button type="button" className={!necessary ? 'selected' : ''} onClick={() => setNecessary(false)}>非必要支出</button></div><button className="command-button" type="submit">记一笔</button></form></section><section className="card pending-card"><h2>非必要支出待评估队列</h2>{pending.length ? pending.map((item) => <DataRow label={`-${money(item.amountCents)}　${item.note}`} key={item.id}><span className="chip sky">待评估</span></DataRow>) : <p className="small">暂无待评估支出</p>}<button className="command-button" onClick={settle}>月末结算</button></section></div>;

  return <div className="finance-view">
    <div className="grid finance-overview"><section className={`card budget-card alert-${progress.alert}`}><h2>月度预算</h2><div className="metric">{money(spentCents)} / <button aria-label="修改月度预算" onClick={() => setBudgetCents(350_000)}>{money(budgetCents)}</button></div><div className="progress"><div className={progress.alert} style={{ width: `${Math.min(100, progress.actualPercent)}%` }} /></div><span className={`chip ${progress.alert === 'normal' ? 'sky' : progress.alert}`}>已用 {Math.round(progress.actualPercent)}%</span><p className="small">{progress.alert === 'crimson' ? '预算已用尽' : progress.alert === 'amber' ? `消费进度领先时间进度 ${Math.round(progress.leadPercent)}%` : '消费进度正常'} · 时间进度 {Math.round(progress.timePercent)}%</p></section><section className="card"><h2>周期订阅预警</h2><DataRow label="ChatGPT Plus"><span className="chip amber">3天后扣费</span></DataRow><DataRow label="iCloud 200G"><span className="small">12天后</span></DataRow></section><section className="card"><h2>今日支出</h2>{lastTransaction ? <><div className="metric">{lastTransaction.amount < 0 ? '-' : '+'}{money(Math.abs(lastTransaction.amount))}</div><p className="small">{lastTransaction.note}</p></> : <p className="small">暂无交易</p>}</section></div>
    {message && <div className="status-message" role="status">{message}</div>}
    <section className="card finance-form-card"><h2>快捷记账</h2><form onSubmit={submitTransaction}><input name="amount" inputMode="decimal" required placeholder="金额，如 -35 或 +200" /><input name="note" maxLength={200} required placeholder="备注，如 买猫粮" /><div className="type-switch"><button type="button" className={necessary ? 'selected' : ''} onClick={() => setNecessary(true)}>必要支出</button><button type="button" className={!necessary ? 'selected' : ''} onClick={() => setNecessary(false)}>非必要支出</button></div><p className="small">非必要支出不会立即计入消费，先进入月末评估队列。</p><button className="command-button" type="submit">记一笔</button></form></section>
    <section className="card pending-card"><h2><span>非必要支出待评估队列</span><span className="tag">月底统一结算</span></h2>{pending.length ? pending.map((item) => <DataRow label={`-${money(item.amountCents)}　${item.note}`} key={item.id}><span className="chip sky">待月底评估</span></DataRow>) : <p className="small">暂无待评估支出</p>}<button className="command-button" onClick={settle}>模拟月末结算</button></section>
    <div className="grid grid-2"><RuleCard title="一进一出拦截示例">检测到支出 <b>-¥200 买新外套</b>：请在物品库指定 1 件旧衣物清理。</RuleCard><RuleCard title="防囤货拦截示例">库存尚有 2 瓶洗发水，预计可用 50 天；冷启动样本不足时不拦截。</RuleCard></div>
  </div>;
}

/** Side effects: none. */
function DataRow({ label, children }: { label: string; children: React.ReactNode }) { return <div className="data-row"><span>{label}</span>{children}</div>; }
/** Side effects: none. */
function RuleCard({ title, children }: { title: string; children: React.ReactNode }) { return <section className="card"><h2>{title}</h2><div className="rule-example">{children}</div></section>; }
