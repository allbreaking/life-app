import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { useDomainResource } from '../../shared/ipc/useDomainResource';
import { foodExpiryStatus } from './itemModel';

const ITEM_TYPES = ['消耗品', '保养品', '使用时期', '固定资产'] as const;
const ALL_ITEM_TYPES = [...ITEM_TYPES, '食物'] as const;
type ItemType = (typeof ALL_ITEM_TYPES)[number];
type Food = { id: string; name: string; location: string; expiry: string };
type Item = { id: string; name: string; type: ItemType; location: string; detail: string };

const foodSchema = z.array(z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  location: z.string().min(1).max(200),
  expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict());
const itemSchema = z.array(z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  type: z.enum(ALL_ITEM_TYPES),
  location: z.string().min(1).max(200),
  detail: z.string().max(500),
}).strict());

/**
 * Spec: docs/specs/item-list-management/01-item-list-management.spec.md.
 * Side effects: persists items.items and items.foods through typed IPC to SQLite and updates local form/status state.
 */
export function Items() {
  const [type, setType] = useState<ItemType>('消耗品');
  const [foods, setFoods] = useDomainResource('items.foods', foodSchema, (import.meta.env.PROD ? [] : [
    { id: 'f1', name: '鲜牛奶', location: '冰箱冷藏层', expiry: '2026-08-04' },
    { id: 'f2', name: '鸡蛋', location: '冰箱蛋架', expiry: '2026-08-18' },
  ]) as Food[]);
  const [items, setItems] = useDomainResource('items.items', itemSchema, (import.meta.env.PROD ? [] : [
    { id: 'i1', name: '净水器滤芯', type: '保养品', location: '厨房水槽下', detail: '上次更换：62 天前 · 周期 90 天' },
    { id: 'i2', name: 'MacBook Pro', type: '固定资产', location: '书房', detail: '购入：2024-03 · 保修至 2027-03' },
  ]) as Item[]);
  const [message, setMessage] = useState('');

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get('name') ?? '').trim();
    const location = String(data.get('location') ?? '').trim();
    const detail = String(data.get('detail') ?? '').trim();
    const expiry = String(data.get('expiry') ?? '');
    if (!name || !location) return setMessage('物品名称和存放位置必填');
    if (name.length > 200 || location.length > 200) return setMessage('名称和位置不能超过 200 字');
    if (detail.length > 500) return setMessage('详情不能超过 500 字');
    if (type === '食物' && !expiry) return setMessage('食物必须填写到期日');
    if (type === '食物') {
      setFoods((values) => [...values, { id: crypto.randomUUID(), name, location, expiry }]);
    } else {
      setItems((values) => [...values, { id: crypto.randomUUID(), name, location, detail, type }]);
    }
    form.reset();
    setMessage(type === '食物' ? '食物已加入完整清单' : '物品已加入清单');
  };

  const updateItem = (next: Item) => {
    setItems((values) => values.map((item) => item.id === next.id ? next : item));
    setMessage('物品已保存');
  };
  const deleteItem = (id: string) => {
    setItems((values) => values.filter((item) => item.id !== id));
    setMessage('物品已删除');
  };
  const updateFood = (next: Food) => {
    setFoods((values) => values.map((food) => food.id === next.id ? next : food));
    setMessage('食物已保存，到期预警已更新');
  };
  const deleteFood = (id: string) => {
    setFoods((values) => values.filter((food) => food.id !== id));
    setMessage('食物已删除');
  };

  return <div className="items-view">
    <section className="card item-form-card">
      <h2>添加物品/资产</h2>
      <div className="type-switch item-types">{ALL_ITEM_TYPES.map((item) => <button type="button" className={type === item ? 'selected' : ''} onClick={() => setType(item)} key={item}>{item === '使用时期' ? '使用时期品' : item}</button>)}</div>
      <form onSubmit={submit}>
        <input name="name" maxLength={200} required placeholder="物品名称" />
        {type !== '食物' && <input name="detail" maxLength={500} placeholder="库存/开封日期/保修期等关键信息" />}
        <input name="location" maxLength={200} required placeholder="存放位置，如 厨房上层 / 卧室抽屉" />
        {type === '食物' && <input name="expiry" type="date" required aria-label="食物到期日" />}
        <button className="command-button" type="submit">保存</button>
      </form>
      {message && <p className="status-message" role="status">{message}</p>}
    </section>

    <section className="card food-list-card">
      <h2><span>食物清单</span><span className="tag">全部展示 · 保质期预警</span></h2>
      <div className="closed-position-head" aria-hidden="true"><span>名称</span><span>位置</span><span>到期日</span><span>状态</span><span>操作</span></div>
      {foods.length === 0 ? <p className="item-empty">暂无食物</p> : foods.map((food) => <FoodRow food={food} onSave={updateFood} onDelete={deleteFood} key={food.id} />)}
    </section>

    <section className="card item-list-card">
      <h2><span>物品清单</span><span className="tag">{items.length} 件</span></h2>
      <div className="closed-position-head" aria-hidden="true"><span>名称</span><span>分类</span><span>位置</span><span>详情</span><span>操作</span></div>
      {items.length === 0 ? <p className="item-empty">暂无物品</p> : items.map((item) => <ItemRow item={item} onSave={updateItem} onDelete={deleteItem} key={item.id} />)}
    </section>

    <section className="card item-learning">
      <h2>学习期样本采集中</h2>
      <DataRow label="洗发水（样本 1/3，暂不预测周期）"><span className="chip sky">采集中</span></DataRow>
      <DataRow label="咖啡豆（样本 4，已可推算）"><span className="chip sky">预测生效</span></DataRow>
    </section>
  </div>;
}

/** Side effects: updates transient edit/error state and delegates persisted save/delete operations to Items. */
function ItemRow({ item, onSave, onDelete }: { item: Item; onSave: (item: Item) => void; onDelete: (id: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item);
  const [error, setError] = useState('');
  const start = () => { setDraft(item); setError(''); setEditing(true); };
  const cancel = () => { setDraft(item); setError(''); setEditing(false); };
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = { ...draft, name: draft.name.trim(), location: draft.location.trim(), detail: draft.detail.trim() };
    if (!next.name || !next.location) return setError('物品名称和存放位置必填');
    if (next.name.length > 200 || next.location.length > 200) return setError('名称和位置不能超过 200 字');
    if (next.detail.length > 500) return setError('详情不能超过 500 字');
    onSave(next);
    setEditing(false);
    setError('');
  };

  if (editing) return <form className="closed-position-row item-list-row watch-row-editor" onSubmit={save} onKeyDown={(event) => { if (event.key === 'Escape') cancel(); }}>
    <label className="sr-only" htmlFor={`item-name-${item.id}`}>编辑 {item.name} 名称</label><input id={`item-name-${item.id}`} value={draft.name} maxLength={200} required onChange={(event) => setDraft({ ...draft, name: event.target.value })} autoFocus />
    <label className="sr-only" htmlFor={`item-type-${item.id}`}>编辑 {item.name} 分类</label><select id={`item-type-${item.id}`} value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as ItemType })}>{[...ITEM_TYPES, ...(item.type === '食物' ? ['食物' as const] : [])].map((value) => <option key={value}>{value}</option>)}</select>
    <label className="sr-only" htmlFor={`item-location-${item.id}`}>编辑 {item.name} 位置</label><input id={`item-location-${item.id}`} value={draft.location} maxLength={200} required onChange={(event) => setDraft({ ...draft, location: event.target.value })} />
    <label className="sr-only" htmlFor={`item-detail-${item.id}`}>编辑 {item.name} 详情</label><input id={`item-detail-${item.id}`} value={draft.detail} maxLength={500} onChange={(event) => setDraft({ ...draft, detail: event.target.value })} />
    <span className="watch-row-actions"><button type="submit" aria-label={`保存 ${item.name} 物品`}>保存</button><button type="button" onClick={cancel} aria-label={`取消编辑 ${item.name} 物品`}>取消</button></span>
    {error && <p className="status-message watch-row-error" role="alert">{error}</p>}
  </form>;

  return <div className="closed-position-row item-list-row">
    <strong>{item.name}</strong><span className="tag">{item.type}</span><span>{item.location}</span><span className="small">{item.detail || '暂无详情'}</span>
    <span className="watch-row-actions"><button type="button" onClick={start} aria-label={`编辑 ${item.name} 物品`}>编辑</button><button type="button" className="danger" onClick={() => onDelete(item.id)} aria-label={`删除 ${item.name} 物品`}>删除</button></span>
  </div>;
}

/** Side effects: updates transient edit/error state and delegates persisted save/delete operations to Items. */
function FoodRow({ food, onSave, onDelete }: { food: Food; onSave: (food: Food) => void; onDelete: (id: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(food);
  const [error, setError] = useState('');
  const status = foodExpiryStatus(food.expiry);
  const alertClass = status.tone === 'normal' ? '' : `alert-${status.tone}`;
  const start = () => { setDraft(food); setError(''); setEditing(true); };
  const cancel = () => { setDraft(food); setError(''); setEditing(false); };
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = { ...draft, name: draft.name.trim(), location: draft.location.trim() };
    if (!next.name || !next.location) return setError('物品名称和存放位置必填');
    if (next.name.length > 200 || next.location.length > 200) return setError('名称和位置不能超过 200 字');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(next.expiry)) return setError('食物必须填写有效到期日');
    onSave(next);
    setEditing(false);
    setError('');
  };

  if (editing) return <form className="closed-position-row food-row watch-row-editor" onSubmit={save} onKeyDown={(event) => { if (event.key === 'Escape') cancel(); }}>
    <label className="sr-only" htmlFor={`food-name-${food.id}`}>编辑 {food.name} 名称</label><input id={`food-name-${food.id}`} value={draft.name} maxLength={200} required onChange={(event) => setDraft({ ...draft, name: event.target.value })} autoFocus />
    <label className="sr-only" htmlFor={`food-location-${food.id}`}>编辑 {food.name} 位置</label><input id={`food-location-${food.id}`} value={draft.location} maxLength={200} required onChange={(event) => setDraft({ ...draft, location: event.target.value })} />
    <label className="sr-only" htmlFor={`food-expiry-${food.id}`}>编辑 {food.name} 到期日</label><input id={`food-expiry-${food.id}`} type="date" value={draft.expiry} required onChange={(event) => setDraft({ ...draft, expiry: event.target.value })} />
    <span className="chip sky">编辑中</span>
    <span className="watch-row-actions"><button type="submit" aria-label={`保存 ${food.name} 食物`}>保存</button><button type="button" onClick={cancel} aria-label={`取消编辑 ${food.name} 食物`}>取消</button></span>
    {error && <p className="status-message watch-row-error" role="alert">{error}</p>}
  </form>;

  return <div className={`closed-position-row food-row ${status.tone} ${alertClass}`.trim()}>
    <strong>{food.name}</strong><span>{food.location}</span><time>{food.expiry}</time><span className={`chip ${status.tone === 'normal' ? 'sky' : status.tone}`}>{status.label}</span>
    <span className="watch-row-actions"><button type="button" onClick={start} aria-label={`编辑 ${food.name} 食物`}>编辑</button><button type="button" className="danger" onClick={() => onDelete(food.id)} aria-label={`删除 ${food.name} 食物`}>删除</button></span>
  </div>;
}

/** Side effects: none. */
function DataRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="data-row"><span>{label}</span>{children}</div>;
}
