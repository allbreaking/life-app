import { useEffect, useRef, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { useDomainResource } from '../../shared/ipc/useDomainResource';
import { initialItems, itemSchema } from '../items/itemModel';
import { budgetCentsSchema, budgetProgress, countsToBudget, dailyBudgetPlan, filterTransactions, initialBudgetCents, initialSpentCents, isWardrobeExpense, localDateKey, parseMoneyToCents, rangeBounds, spentCentsSchema, subscriptionAlert, subscriptionCardTone, transactionTotals, wealthGoalProgress, WEALTH_GOAL_UNIT_CENTS, type BillKindFilter, type BillRange, type Subscription, type Transaction, type TransactionKind } from './financeModel';

type Pending = { id: string; note: string; amountCents: number; billId?: string };
type BillDraft = { note: string; amount: string; kind: TransactionKind; occurredAt: string };
type SubDraft = { name: string; amount: string; nextChargeOn: string };
type GoalFx = { type: 'plus' | 'minus'; tick: number };
type Intercept = { amount: number; note: string; kind: TransactionKind };

const pendingSchema = z.array(z.object({ id: z.string().min(1).max(100), note: z.string().min(1).max(200), amountCents: z.number().int().positive(), billId: z.string().min(1).max(100).optional() }).strict());
const billsSchema = z.array(z.object({
  id: z.string().min(1).max(100),
  amountCents: z.number().int().refine((value) => value !== 0, '非零金额'),
  note: z.string().min(1).max(200),
  kind: z.enum(['necessary', 'unnecessary', 'approved', 'income']),
  occurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict());
const subscriptionsSchema = z.array(z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(60),
  amountCents: z.number().int().positive(),
  nextChargeOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict());
const kindLabels: Record<BillKindFilter, string> = { all: '全部', necessary: '必要支出', unnecessary: '非必要支出', approved: '已批准', income: '收入' };
const kindFilters: BillKindFilter[] = ['all', 'necessary', 'approved', 'unnecessary', 'income'];
const kindChipClass: Record<BillKindFilter, string> = { all: '', necessary: 'emerald', unnecessary: 'amber', approved: 'emerald', income: 'sky' };
const rangePresets: [BillRange, string][] = [['all', '全部时间'], ['today', '今天'], ['7d', '近7天'], ['month', '本月']];
const confettiColors = ['var(--accent)', 'var(--crimson)', 'var(--amber)', 'var(--emerald)', 'var(--being)'];
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const money = (cents: number) => `¥${(cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const wholeMoney = (cents: number) => `¥${(cents / 100).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;
const billAmountText = (bill: Transaction) => `${bill.kind === 'income' ? '+' : '-'}${money(Math.abs(bill.amountCents))}`;
const dayOffset = (offset: number) => localDateKey(new Date(Date.now() + offset * 86_400_000));

/** Side effects: none. Builds relative-date demo bills whose necessary sum matches the demo used budget. Non-essential items stay in the demo pending queue until approved. */
function demoBills(): Transaction[] {
  return [
    { id: 'b1', amountCents: -3500, note: '买猫粮 · 宠物耗材', kind: 'necessary', occurredAt: dayOffset(0) },
    { id: 'b3', amountCents: -4200, note: '午餐 · 工作餐', kind: 'necessary', occurredAt: dayOffset(0) },
    { id: 'b4', amountCents: 2_000_000, note: '本月工资', kind: 'income', occurredAt: dayOffset(-2) },
    { id: 'b6', amountCents: -200000, note: '房租', kind: 'necessary', occurredAt: dayOffset(-1) },
    { id: 'b7', amountCents: -12300, note: '交通充值', kind: 'necessary', occurredAt: dayOffset(-2) },
    { id: 'b8', amountCents: -26000, note: '超市采购', kind: 'necessary', occurredAt: dayOffset(-2) },
  ];
}

/** Side effects: none. Builds relative-date demo subscriptions for non-production runs. */
function demoSubscriptions(): Subscription[] {
  return [
    { id: 's1', name: '视频会员', amountCents: 2500, nextChargeOn: dayOffset(0) },
    { id: 's2', name: 'ChatGPT Plus', amountCents: 14000, nextChargeOn: dayOffset(3) },
    { id: 's3', name: 'iCloud 200G', amountCents: 2100, nextChargeOn: dayOffset(12) },
  ];
}

/** Side effects: persists budget, bills, subscriptions, items release, and wealth-goal state through typed IPC to SQLite; form switches and messages remain local. */
export function Finance() {
  const [budgetCents, setBudgetCents] = useDomainResource('finance.budgetCents', budgetCentsSchema, initialBudgetCents);
  const [spentCents, setSpentCents] = useDomainResource('finance.spentCents', spentCentsSchema, initialSpentCents);
  const [goalCompletedUnits, setGoalCompletedUnits] = useDomainResource('finance.goalCompletedUnits', z.number().int().min(0).max(3000), 1500);
  const [pending, setPending] = useDomainResource('finance.pending', pendingSchema, (import.meta.env.PROD ? [] : [{ id: 'p1', note: '蓝牙耳机（想换新的，非必需）', amountCents: 12_800 }, { id: 'p2', note: '周末电影', amountCents: 8800 }]) as Pending[]);
  const [bills, setBills] = useDomainResource('finance.transactions', billsSchema, import.meta.env.PROD ? [] : demoBills());
  const [subscriptions, setSubscriptions] = useDomainResource('finance.subscriptions', subscriptionsSchema, import.meta.env.PROD ? [] : demoSubscriptions());
  const [itemList, setItemList] = useDomainResource('items.items', itemSchema, initialItems);
  const [necessary, setNecessary] = useState(true);
  const [sign, setSign] = useState<'-' | '+'>('-');
  const [message, setMessage] = useState('');
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState('');
  const [billsOpen, setBillsOpen] = useState(false);
  const [billQuery, setBillQuery] = useState('');
  const [billKind, setBillKind] = useState<BillKindFilter>('all');
  const [billRange, setBillRange] = useState<BillRange>('all');
  const [billFrom, setBillFrom] = useState('');
  const [billTo, setBillTo] = useState('');
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [billDraft, setBillDraft] = useState<BillDraft>({ note: '', amount: '', kind: 'necessary', occurredAt: '' });
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [subDraft, setSubDraft] = useState<SubDraft>({ name: '', amount: '', nextChargeOn: '' });
  const [intercept, setIntercept] = useState<Intercept | null>(null);
  const [resetArmed, setResetArmed] = useState(false);
  const [goalFx, setGoalFx] = useState<GoalFx | null>(null);
  const fxTimer = useRef<number | null>(null);
  const recordFormRef = useRef<HTMLFormElement>(null);
  const progress = budgetProgress(spentCents, budgetCents);
  const plan = dailyBudgetPlan(spentCents, budgetCents);
  const goal = wealthGoalProgress(goalCompletedUnits);
  const budgetConfigured = budgetCents > 0;
  const budgetTone = budgetConfigured ? progress.alert : 'normal';
  const billBounds = billRange === 'custom' ? { from: billFrom, to: billTo } : rangeBounds(billRange);
  const visibleBills = filterTransactions(bills, { query: billQuery, kind: billKind, from: billBounds.from, to: billBounds.to });
  const billTotals = transactionTotals(visibleBills);
  const subTone = subscriptionCardTone(subscriptions);
  const sortedSubscriptions = [...subscriptions].sort((a, b) => a.nextChargeOn.localeCompare(b.nextChargeOn));

  useEffect(() => () => { if (fxTimer.current !== null) window.clearTimeout(fxTimer.current); }, []);

  const triggerGoalFx = (type: 'plus' | 'minus') => {
    setGoalFx((previous) => ({ type, tick: (previous?.tick ?? 0) + 1 }));
    if (fxTimer.current !== null) window.clearTimeout(fxTimer.current);
    fxTimer.current = window.setTimeout(() => setGoalFx(null), 900);
  };
  const changeGoalUnits = (delta: 1 | -1) => {
    if (delta === 1 && goal.remainingUnits === 0) return setMessage('目标已完成，无法继续增加');
    if (delta === -1 && goal.completedUnits === 0) return setMessage('当前进度为 0，无法减少');
    setGoalCompletedUnits((value) => value + delta);
    setMessage(`已${delta === 1 ? '增加' : '减少'} 1 份（${wholeMoney(WEALTH_GOAL_UNIT_CENTS)}）`);
    triggerGoalFx(delta === 1 ? 'plus' : 'minus');
  };
  const applyBillRange = (range: BillRange) => {
    setBillRange(range);
    const bounds = rangeBounds(range);
    setBillFrom(bounds.from);
    setBillTo(bounds.to);
  };
  const recordTransaction = ({ amount, note, kind }: { amount: number; note: string; kind: TransactionKind }) => {
    if (kind === 'unnecessary') {
      setPending((values) => [...values, { id: crypto.randomUUID(), note, amountCents: Math.abs(amount) }]);
      setMessage('非必要支出已进入待评估队列，通过后才计入账单与预算');
      return;
    }
    setBills((values) => [{ id: crypto.randomUUID(), amountCents: amount, note, kind, occurredAt: localDateKey() }, ...values]);
    if (kind === 'income') setMessage('收入已记录，不计入预算消费');
    else { setSpentCents((value) => value + Math.abs(amount)); setMessage('已记入必要支出，并累加到本月已用预算'); }
  };
  const submitTransaction = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const magnitude = String(data.get('amount') ?? '').replace(/^[+-]/, '').trim();
    const amount = parseMoneyToCents(`${sign}${magnitude}`); const note = String(data.get('note') ?? '').trim();
    if (amount === null || !note || note.length > 200) return setMessage('请输入有效金额和 1–200 字备注');
    const kind: TransactionKind = sign === '+' ? 'income' : necessary ? 'necessary' : 'unnecessary';
    if (amount < 0 && isWardrobeExpense(note)) { setIntercept({ amount, note, kind }); setMessage('检测到衣物支出，请先清理 1 件旧衣物再入账'); return; }
    recordTransaction({ amount, note, kind });
    form.reset();
  };
  const releaseItemAndRecord = (itemId: string) => {
    if (!intercept) return;
    const target = itemList.find((item) => item.id === itemId);
    if (!target) return;
    setItemList((values) => values.filter((item) => item.id !== itemId));
    recordTransaction(intercept);
    setMessage(`已清理「${target.name}」，一进一出完成并记入 ${money(Math.abs(intercept.amount))}`);
    setIntercept(null);
    recordFormRef.current?.reset();
  };
  const cancelIntercept = () => { setIntercept(null); setMessage('已取消本次衣物支出'); };
  const clearFinanceData = () => {
    setBudgetCents(0); setSpentCents(0); setPending([]); setBills([]); setSubscriptions([]); setGoalCompletedUnits(0);
    setEditingBillId(null); setEditingSubId(null); setIntercept(null); setBillsOpen(false);
    setResetArmed(false); setMessage('财务数据已清空');
  };
  const approvePending = (item: Pending) => {
    const surplus = budgetCents - spentCents;
    if (surplus < item.amountCents) return setMessage(`预算结余 ${money(Math.max(0, surplus))}，不足以放行 ${money(item.amountCents)}`);
    setSpentCents((value) => value + item.amountCents);
    setBills((values) => values.some((bill) => bill.id === item.billId)
      ? values.map((bill) => bill.id === item.billId ? { ...bill, kind: 'approved' as TransactionKind } : bill)
      : [{ id: crypto.randomUUID(), amountCents: -item.amountCents, note: item.note, kind: 'approved' as TransactionKind, occurredAt: localDateKey() }, ...values]);
    setPending((values) => values.filter((value) => value.id !== item.id));
    setMessage(`已通过「${item.note}」，已进入账单并计入本月已用预算 ${money(item.amountCents)}`);
  };
  const rejectPending = (item: Pending) => {
    if (item.billId) setBills((values) => values.filter((bill) => bill.id !== item.billId));
    setPending((values) => values.filter((value) => value.id !== item.id));
    setMessage(`已拒绝「${item.note}」，不会进入账单`);
  };
  const settle = () => {
    const pendingTotal = pending.reduce((sum, item) => sum + item.amountCents, 0);
    const surplus = budgetCents - spentCents;
    if (!pending.length) return setMessage('本月没有待评估支出');
    if (surplus < pendingTotal) return setMessage(`预算结余 ${money(Math.max(0, surplus))}，不足以覆盖 ${money(pendingTotal)}`);
    setSpentCents((value) => value + pendingTotal);
    setBills((values) => {
      const existing = new Set(values.map((bill) => bill.id));
      const updated = values.map((bill) => pending.some((item) => item.billId === bill.id) ? { ...bill, kind: 'approved' as TransactionKind } : bill);
      const created = pending.filter((item) => !item.billId || !existing.has(item.billId)).map((item) => ({ id: crypto.randomUUID(), amountCents: -item.amountCents, note: item.note, kind: 'approved' as TransactionKind, occurredAt: localDateKey() }));
      return [...created, ...updated];
    });
    setPending([]);
    setMessage(`已全部通过，${money(pendingTotal)} 已进入账单与本月已用预算`);
  };
  const removeBillEffects = (bill: Transaction) => {
    if (countsToBudget(bill.kind)) setSpentCents((value) => Math.max(0, value - Math.abs(bill.amountCents)));
    if (bill.kind === 'unnecessary') setPending((values) => values.filter((item) => item.billId !== bill.id));
  };
  const applyBillEffects = (bill: Transaction) => {
    if (countsToBudget(bill.kind)) setSpentCents((value) => value + Math.abs(bill.amountCents));
    if (bill.kind === 'unnecessary') setPending((values) => [...values, { id: crypto.randomUUID(), billId: bill.id, note: bill.note, amountCents: Math.abs(bill.amountCents) }]);
  };
  const startBillEdit = (bill: Transaction) => {
    setEditingBillId(bill.id);
    setBillDraft({ note: bill.note, amount: (Math.abs(bill.amountCents) / 100).toFixed(2), kind: bill.kind, occurredAt: bill.occurredAt });
  };
  const updateBillDraft = (patch: Partial<BillDraft>) => setBillDraft((draft) => ({ ...draft, ...patch }));
  const cancelBillEdit = () => setEditingBillId(null);
  const saveBillEdit = (event: FormEvent<HTMLFormElement>, bill: Transaction) => {
    event.preventDefault();
    const note = billDraft.note.trim();
    const magnitude = billDraft.amount.replace(/^[+-]/, '').trim();
    const amount = parseMoneyToCents(`${billDraft.kind === 'income' ? '+' : '-'}${magnitude}`);
    if (!note || note.length > 200) return setMessage('账单备注应为 1–200 字');
    if (amount === null) return setMessage('账单金额应为有效非零数值');
    if (!datePattern.test(billDraft.occurredAt)) return setMessage('请选择有效的账单日期');
    const next: Transaction = { id: bill.id, amountCents: amount, note, kind: billDraft.kind, occurredAt: billDraft.occurredAt };
    removeBillEffects(bill);
    applyBillEffects(next);
    setBills((values) => values.map((item) => item.id === bill.id ? next : item));
    setEditingBillId(null);
    setMessage('账单已更新');
  };
  const deleteBill = (bill: Transaction) => {
    removeBillEffects(bill);
    setBills((values) => values.filter((item) => item.id !== bill.id));
    if (editingBillId === bill.id) setEditingBillId(null);
    setMessage(`已删除账单「${bill.note}」`);
  };
  const addSubscription = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const name = String(data.get('name') ?? '').trim();
    const amount = parseMoneyToCents(String(data.get('amount') ?? '').replace(/^[+-]/, '').trim());
    const nextChargeOn = String(data.get('nextChargeOn') ?? '');
    if (!name || name.length > 60) return setMessage('订阅名称应为 1–60 字');
    if (amount === null || amount < 0) return setMessage('订阅金额应为有效正数');
    if (!datePattern.test(nextChargeOn)) return setMessage('请选择下次扣费日期');
    setSubscriptions((values) => [...values, { id: crypto.randomUUID(), name, amountCents: Math.abs(amount), nextChargeOn }]);
    form.reset();
    setMessage(`已添加订阅「${name}」`);
  };
  const startSubEdit = (subscription: Subscription) => {
    setEditingSubId(subscription.id);
    setSubDraft({ name: subscription.name, amount: (subscription.amountCents / 100).toFixed(2), nextChargeOn: subscription.nextChargeOn });
  };
  const updateSubDraft = (patch: Partial<SubDraft>) => setSubDraft((draft) => ({ ...draft, ...patch }));
  const cancelSubEdit = () => setEditingSubId(null);
  const saveSubEdit = (event: FormEvent<HTMLFormElement>, subscription: Subscription) => {
    event.preventDefault();
    const name = subDraft.name.trim();
    const amount = parseMoneyToCents(subDraft.amount.replace(/^[+-]/, '').trim());
    if (!name || name.length > 60) return setMessage('订阅名称应为 1–60 字');
    if (amount === null || amount < 0) return setMessage('订阅金额应为有效正数');
    if (!datePattern.test(subDraft.nextChargeOn)) return setMessage('请选择下次扣费日期');
    setSubscriptions((values) => values.map((item) => item.id === subscription.id ? { ...item, name, amountCents: Math.abs(amount), nextChargeOn: subDraft.nextChargeOn } : item));
    setEditingSubId(null);
    setMessage('订阅已更新');
  };
  const deleteSubscription = (subscription: Subscription) => {
    setSubscriptions((values) => values.filter((item) => item.id !== subscription.id));
    if (editingSubId === subscription.id) setEditingSubId(null);
    setMessage(`已删除订阅「${subscription.name}」`);
  };
  const startBudgetEdit = () => {
    setBudgetDraft((budgetCents / 100).toFixed(2));
    setEditingBudget(true);
  };
  const cancelBudgetEdit = () => {
    setBudgetDraft('');
    setEditingBudget(false);
  };
  const saveBudget = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextBudget = parseMoneyToCents(budgetDraft);
    if (nextBudget === null || nextBudget < 0) return setMessage('请输入大于 0、最多两位小数的月度预算');
    setBudgetCents(nextBudget);
    setMessage(`月度预算已更新为 ${money(nextBudget)}`);
    cancelBudgetEdit();
  };
  const budgetMetric = <div className="metric">{money(spentCents)} / {editingBudget ? <form className="position-price-editor" onSubmit={saveBudget}><label className="sr-only" htmlFor="monthly-budget">月度预算金额</label><input id="monthly-budget" inputMode="decimal" autoComplete="off" value={budgetDraft} onChange={(event) => setBudgetDraft(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); cancelBudgetEdit(); } }} autoFocus required /><button type="submit">保存</button><button type="button" onClick={cancelBudgetEdit}>取消</button></form> : <button aria-label="修改月度预算" onClick={startBudgetEdit}>{money(budgetCents)}</button>}</div>;
  const budgetBars = <div className="budget-bars">
    <div className="budget-bar-row"><span className="small">预算</span><div className="progress" role="progressbar" aria-label="本月预算消费进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.actualPercent)}><div className={progress.alert} style={{ width: `${Math.min(100, progress.actualPercent)}%` }} /></div></div>
    <div className="budget-bar-row"><span className="small">时间</span><div className="progress time" role="progressbar" aria-label="当月时间进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.timePercent)}><div className="time" style={{ width: `${Math.min(100, progress.timePercent)}%` }} /></div></div>
  </div>;
  const plannerLine = <p className="small">当月日均预算 {money(plan.averagePerDayCents)} · 剩余 {plan.remainingDays} 天可支配 {money(Math.max(0, plan.remainingPerDayCents))}/天</p>;
  const budgetHint = progress.alert === 'crimson' ? '预算已用尽' : progress.alert === 'amber' ? `消费进度领先时间进度 ${Math.round(progress.leadPercent)}%` : '消费进度正常';
  const budgetCard = <section className={`card budget-card alert-${budgetTone}`}>
    <h2>月度预算</h2>
    {budgetMetric}
    {budgetConfigured ? <>{budgetBars}<span className={`chip ${progress.alert === 'normal' ? 'sky' : progress.alert}`}>已用 {Math.round(progress.actualPercent)}%</span>{plannerLine}<p className="small">{budgetHint} · 时间进度 {Math.round(progress.timePercent)}%</p></> : <p className="small">未设置月度预算，点击上方金额即可设置。</p>}
  </section>;
  const goalCard = <section className={`card north-star-card budget-card${goalFx?.type === 'minus' ? ' goal-shake' : ''}`}>
    <h2><span>500 元积累目标</span><span className="tag">长期目标</span></h2>
    <div className="work-summary"><div className="metric">{goal.completedUnits.toLocaleString('zh-CN')} / {goal.targetUnits.toLocaleString('zh-CN')} 份</div><strong>{Math.round(goal.percent)}%</strong></div>
    <p className="small">{wholeMoney(goal.completedCents)} / {wholeMoney(goal.targetCents)} · 每份 ¥500</p>
    <div className="progress" role="progressbar" aria-label="500 元积累目标进度" aria-valuemin={0} aria-valuemax={goal.targetUnits} aria-valuenow={goal.completedUnits} aria-valuetext={`已完成 ${goal.completedUnits} 份，共 ${goal.targetUnits} 份`}><div style={{ width: `${goal.percent}%` }} /></div>
    <div className="goal-actions"><button type="button" className="goal-step plus" aria-label="增加 1 份" onClick={() => changeGoalUnits(1)} disabled={goal.remainingUnits === 0}>+</button><button type="button" className="goal-step minus" aria-label="减少 1 份" onClick={() => changeGoalUnits(-1)} disabled={goal.completedUnits === 0}>−</button><span className="small">每次点击变动 1 份（{wholeMoney(WEALTH_GOAL_UNIT_CENTS)}）</span></div>
    {goalFx && <div className="goal-fx" key={`${goalFx.type}-${goalFx.tick}`} aria-hidden="true">{goalFx.type === 'plus' ? <div className="goal-confetti">{Array.from({ length: 12 }, (_, index) => <span key={index} style={{ background: confettiColors[index % confettiColors.length] }} />)}</div> : <><div className="goal-flash" /><span className="goal-minus-badge">−1</span></>}</div>}
  </section>;
  const financeToolbar = <div className="finance-toolbar">
    <button className="command-button" aria-expanded={billsOpen} onClick={() => setBillsOpen((open) => !open)}>全部账单（{bills.length}）</button>
    {resetArmed ? <><button className="command-button danger" onClick={clearFinanceData}>确认清空财务数据</button><button className="command-button" onClick={() => setResetArmed(false)}>取消</button></> : <button className="command-button" onClick={() => setResetArmed(true)}>清空财务数据</button>}
  </div>;
  const billRows = visibleBills.map((bill) => editingBillId === bill.id ? (
    <form className="bill-row bill-row-editor" key={bill.id} noValidate onSubmit={(event) => saveBillEdit(event, bill)} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); cancelBillEdit(); } }}>
      <input type="date" aria-label="账单日期" value={billDraft.occurredAt} onChange={(event) => updateBillDraft({ occurredAt: event.currentTarget.value })} required />
      <input aria-label="账单备注" maxLength={200} autoComplete="off" value={billDraft.note} onChange={(event) => updateBillDraft({ note: event.currentTarget.value })} required />
      <select aria-label="账单类型" value={billDraft.kind} onChange={(event) => updateBillDraft({ kind: event.currentTarget.value as TransactionKind })}><option value="necessary">必要支出</option><option value="approved">已批准</option><option value="unnecessary">非必要支出</option><option value="income">收入</option></select>
      <input aria-label="账单金额" inputMode="decimal" autoComplete="off" value={billDraft.amount} onChange={(event) => updateBillDraft({ amount: event.currentTarget.value })} required />
      <span className="bill-row-actions"><button type="submit">保存</button><button type="button" onClick={cancelBillEdit}>取消</button></span>
    </form>
  ) : (
    <div className="bill-row" key={bill.id}>
      <time dateTime={bill.occurredAt}>{bill.occurredAt}</time>
      <span className="bill-note">{bill.note}</span>
      <span className={`chip ${kindChipClass[bill.kind]}`}>{kindLabels[bill.kind]}</span>
      <span className={bill.kind === 'income' ? 'bill-amount income' : 'bill-amount'}>{billAmountText(bill)}</span>
      <span className="bill-row-actions"><button type="button" aria-label={`编辑账单 ${bill.note}`} onClick={() => startBillEdit(bill)}>编辑</button><button type="button" className="danger" aria-label={`删除账单 ${bill.note}`} onClick={() => deleteBill(bill)}>删除</button></span>
    </div>
  ));
  const billsSection = <section className="card bills-card">
    <h2><span>全部账单</span><span className="tag">{visibleBills.length} / {bills.length} 条 · 支出 {money(billTotals.spentCents)} · 收入 {money(billTotals.incomeCents)}</span></h2>
    <div className="bill-filters">
      <label className="bill-search"><span className="sr-only">搜索账单备注</span><input type="search" value={billQuery} onChange={(event) => setBillQuery(event.currentTarget.value)} placeholder="搜索备注" /></label>
      <div className="type-switch" role="group" aria-label="按收支类型筛选">{kindFilters.map((value) => <button type="button" key={value} className={billKind === value ? 'selected' : ''} aria-pressed={billKind === value} onClick={() => setBillKind(value)}>{kindLabels[value]}</button>)}</div>
      <div className="type-switch" role="group" aria-label="按时间筛选">{rangePresets.map(([value, label]) => <button type="button" key={value} className={billRange === value ? 'selected' : ''} aria-pressed={billRange === value} onClick={() => applyBillRange(value)}>{label}</button>)}</div>
      <div className="bill-dates"><label>起 <input type="date" aria-label="开始日期" value={billFrom} onChange={(event) => { setBillFrom(event.currentTarget.value); setBillRange('custom'); }} /></label><label>止 <input type="date" aria-label="结束日期" value={billTo} onChange={(event) => { setBillTo(event.currentTarget.value); setBillRange('custom'); }} /></label></div>
    </div>
    {visibleBills.length ? <><div className="bill-head"><span>日期</span><span>备注</span><span>类型</span><span>金额</span><span>操作</span></div>{billRows}</> : <p className="small">没有匹配的账单，试试调整搜索或筛选条件。</p>}
  </section>;
  const subscriptionRows = sortedSubscriptions.map((subscription) => {
    const alert = subscriptionAlert(subscription.nextChargeOn);
    return editingSubId === subscription.id ? (
      <form className="subscription-row subscription-row-editor" key={subscription.id} noValidate onSubmit={(event) => saveSubEdit(event, subscription)} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); cancelSubEdit(); } }}>
        <input aria-label="编辑订阅名称" maxLength={60} autoComplete="off" value={subDraft.name} onChange={(event) => updateSubDraft({ name: event.currentTarget.value })} required />
        <input aria-label="编辑订阅金额" inputMode="decimal" autoComplete="off" value={subDraft.amount} onChange={(event) => updateSubDraft({ amount: event.currentTarget.value })} required />
        <input type="date" aria-label="编辑订阅日期" value={subDraft.nextChargeOn} onChange={(event) => updateSubDraft({ nextChargeOn: event.currentTarget.value })} required />
        <span className="bill-row-actions"><button type="submit">保存</button><button type="button" onClick={cancelSubEdit}>取消</button></span>
      </form>
    ) : (
      <div className="subscription-row" key={subscription.id}>
        <span className="bill-note">{subscription.name}</span>
        <span className="subscription-amount">{money(subscription.amountCents)}</span>
        <span className={`chip ${alert.tone === 'crimson' ? 'crimson' : alert.tone === 'amber' ? 'amber' : 'sky'}`}>{alert.label}</span>
        <span className="bill-row-actions"><button type="button" aria-label={`编辑订阅 ${subscription.name}`} onClick={() => startSubEdit(subscription)}>编辑</button><button type="button" className="danger" aria-label={`删除订阅 ${subscription.name}`} onClick={() => deleteSubscription(subscription)}>删除</button></span>
      </div>
    );
  });
  const alertSubscriptions = sortedSubscriptions.filter((subscription) => subscriptionAlert(subscription.nextChargeOn).tone !== 'normal');
  const subscriptionPreviewRows = alertSubscriptions.map((subscription) => {
    const alert = subscriptionAlert(subscription.nextChargeOn);
    return <div className="subscription-preview-row" key={subscription.id}><span className="bill-note">{subscription.name}</span><span className="subscription-amount">{money(subscription.amountCents)}</span><span className={`chip ${alert.tone === 'crimson' ? 'crimson' : 'amber'}`}>{alert.label}</span></div>;
  });
  const subscriptionCard = <section className={`card subscription-card${subTone ? ` alert-${subTone}` : ''}`}>
    <h2><span>周期订阅预警</span>{subTone && <span className="tag">{subTone === 'crimson' ? '即将/已扣费' : '即将扣费'}</span>}</h2>
    {alertSubscriptions.length ? subscriptionPreviewRows : <p className="small">近期没有需要处理的扣费。</p>}
  </section>;
  const subscriptionManager = <section className="card subscription-manager">
    <h2><span>周期订阅管理</span><span className="tag">{subscriptions.length} 条</span></h2>
    <form className="subscription-form" onSubmit={addSubscription}>
      <input name="name" maxLength={60} aria-label="订阅名称" autoComplete="off" required placeholder="订阅名称" />
      <input name="amount" inputMode="decimal" aria-label="订阅金额" autoComplete="off" required placeholder="金额，如 30" />
      <input name="nextChargeOn" type="date" aria-label="下次扣费日期" required />
      <button className="command-button" type="submit">添加订阅</button>
    </form>
    {sortedSubscriptions.length ? subscriptionRows : <p className="small">暂无订阅。添加后，扣费前 3 天预警卡会闪烁提醒。</p>}
  </section>;
  const pendingCard = <section className="card pending-card">
    <h2><span>非必要支出待评估队列</span><span className="tag">逐项审批</span></h2>
    {pending.length ? pending.map((item) => <div className="pending-row" key={item.id}><span className="pending-label">-{money(item.amountCents)}　{item.note}</span><span className="pending-actions"><button type="button" className="approve" onClick={() => approvePending(item)} aria-label={`通过 ${item.note}`}>通过</button><button type="button" className="reject" onClick={() => rejectPending(item)} aria-label={`拒绝 ${item.note}`}>拒绝</button></span></div>) : <p className="small">暂无待评估支出</p>}
    <button className="command-button" onClick={settle}>全部通过</button>
  </section>;
  const interceptCard = intercept && <section className="card intercept-card alert-amber" aria-label="一进一出拦截">
    <h2><span>一进一出拦截</span><span className="tag">需清理 1 件</span></h2>
    <p className="small">检测到衣物支出 <b>-{money(Math.abs(intercept.amount))}　{intercept.note}</b>，请先选择要清理的旧物品，完成后才会入账。</p>
    {itemList.length ? <div className="intercept-list">{itemList.map((item) => <div className="intercept-row" key={item.id}><span className="bill-note">{item.name}</span><span className="small">{item.type} · {item.location}</span><button type="button" className="command-button" onClick={() => releaseItemAndRecord(item.id)} aria-label={`清理 ${item.name} 并记账`}>清理并记账</button></div>)}</div> : <p className="small">物品库暂无可清理的物品，请先到「物品」模块添加，或取消本次支出。</p>}
    <button type="button" className="command-button" onClick={cancelIntercept}>取消本次支出</button>
  </section>;
  const recordForm = <section className="card finance-form-card">
    <h2>快捷记账</h2>
    <div className="finance-record-body">
      <form ref={recordFormRef} onSubmit={submitTransaction}><div className="finance-amount"><div className="sign-switch" role="group" aria-label="收支方向"><button type="button" className={sign === '-' ? 'selected' : ''} aria-pressed={sign === '-'} aria-label="支出" onClick={() => setSign('-')}>−</button><button type="button" className={sign === '+' ? 'selected' : ''} aria-pressed={sign === '+'} aria-label="收入" onClick={() => setSign('+')}>+</button></div><label className="sr-only" htmlFor="transaction-amount">金额</label><input id="transaction-amount" name="amount" inputMode="decimal" autoComplete="off" required placeholder="0.00" /></div><input name="note" maxLength={200} autoComplete="off" required placeholder="备注" /><div className="type-switch" role="group" aria-label="支出类型"><button type="button" className={necessary ? 'selected' : ''} onClick={() => setNecessary(true)} disabled={sign === '+'}>必要支出</button><button type="button" className={!necessary ? 'selected' : ''} onClick={() => setNecessary(false)} disabled={sign === '+'}>非必要支出</button></div><p className="small">{sign === '+' ? '选择“+”记收入，收入不计入预算消费。' : necessary ? '必要支出会立即累加到本月已用预算。' : '非必要支出先进入月末评估队列，暂不计入已用预算。'}</p><button className="command-button" type="submit" disabled={intercept !== null}>记一笔</button></form>
      {!import.meta.env.PROD && <aside className="finance-rule-aside" aria-label="拦截规则说明"><p className="rule-note"><strong>一进一出</strong>备注含「外套 / 衣服 / 鞋」等衣物词时，需先清理 1 件旧物品才会入账。</p><p className="rule-note"><strong>防囤货拦截示例</strong>库存尚有 2 瓶洗发水，预计可用 50 天；冷启动样本不足时不拦截。</p></aside>}
    </div>
  </section>;

  return <div className="finance-view">
    {financeToolbar}
    {billsOpen && billsSection}
    {goalCard}
    <div className="grid finance-overview">
      {budgetCard}
      {subscriptionCard}
      {pendingCard}
    </div>
    {message && <div className="status-message" role="status">{message}</div>}
    {recordForm}
    {interceptCard}
    {subscriptionManager}
  </div>;
}

