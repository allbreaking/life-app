import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { useDomainResource } from '../../shared/ipc/useDomainResource';
import { foodExpiryStatus } from './itemModel';

type ItemType = '消耗品' | '保养品' | '使用时期' | '固定资产' | '食物';
type Food = { id: string; name: string; location: string; expiry: string };
type Item = { id: string; name: string; type: ItemType; location: string; detail: string };
const foodSchema = z.array(z.object({ id: z.string().min(1).max(100), name: z.string().min(1).max(200), location: z.string().min(1).max(200), expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict());
const itemSchema = z.array(z.object({ id: z.string().min(1).max(100), name: z.string().min(1).max(200), type: z.enum(['消耗品', '保养品', '使用时期', '固定资产', '食物']), location: z.string().min(1).max(200), detail: z.string().max(500) }).strict());

/** Side effects: persists inventory changes through typed IPC to SQLite; selected form type remains local. */
export function Items() {
  const [type, setType] = useState<ItemType>('消耗品');
  const [foods, setFoods] = useDomainResource('items.foods', foodSchema, (import.meta.env.PROD ? [] : [{ id: 'f1', name: '鲜牛奶', location: '冰箱冷藏层', expiry: '2026-08-04' }, { id: 'f2', name: '鸡蛋', location: '冰箱蛋架', expiry: '2026-08-18' }]) as Food[]);
  const [items, setItems] = useDomainResource('items.items', itemSchema, (import.meta.env.PROD ? [] : [{ id: 'i1', name: '净水器滤芯', type: '保养品', location: '厨房水槽下', detail: '上次更换：62 天前 · 周期 90 天' }, { id: 'i2', name: 'MacBook Pro', type: '固定资产', location: '书房', detail: '购入：2024-03 · 保修至 2027-03' }]) as Item[]);
  const [message, setMessage] = useState('');
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const name = String(data.get('name') ?? '').trim(); const location = String(data.get('location') ?? '').trim(); const detail = String(data.get('detail') ?? '').trim(); const expiry = String(data.get('expiry') ?? ''); if (!name || !location) return setMessage('物品名称和存放位置必填'); if (name.length > 200 || location.length > 200) return setMessage('名称和位置不能超过 200 字'); if (type === '食物' && !expiry) return setMessage('食物必须填写到期日'); if (type === '食物') setFoods((values) => [...values, { id: crypto.randomUUID(), name, location, expiry }]); else setItems((values) => [...values, { id: crypto.randomUUID(), name, location, detail, type }]); form.reset(); setMessage(type === '食物' ? '食物已加入完整清单（运行态）' : '物品已加入运行态清单'); };
  return <div className="items-view"><section className="card item-form-card"><h2>添加物品/资产</h2><div className="type-switch item-types">{(['消耗品', '保养品', '使用时期', '固定资产', '食物'] as ItemType[]).map((item) => <button className={type === item ? 'selected' : ''} onClick={() => setType(item)} key={item}>{item === '使用时期' ? '使用时期品' : item}</button>)}</div><form onSubmit={submit}><input name="name" maxLength={200} required placeholder="物品名称" /><input name="detail" maxLength={500} placeholder="库存/开封日期/保修期等关键信息" /><input name="location" maxLength={200} required placeholder="存放位置，如 厨房上层 / 卧室抽屉" />{type === '食物' && <input name="expiry" type="date" required aria-label="食物到期日" />}<button className="command-button" type="submit">保存</button></form>{message && <p className="status-message" role="status">{message}</p>}</section><section className="card food-list-card"><h2><span>食物清单</span><span className="tag">全部展示 · 保质期预警</span></h2>{foods.map((food) => <FoodRow food={food} key={food.id} />)}</section><div className="item-grid">{items.map((item) => <section className="card" key={item.id}><h2><span>{item.name}</span><span className="tag">{item.type}</span></h2><p className="small">{item.detail || '暂无详情'} · 位置：{item.location}</p></section>)}</div><section className="card item-learning"><h2>学习期样本采集中</h2><DataRow label="洗发水（样本 1/3，暂不预测周期）"><span className="chip sky">采集中</span></DataRow><DataRow label="咖啡豆（样本 4，已可推算）"><span className="chip sky">预测生效</span></DataRow></section></div>;
}

/** Side effects: none. */
function FoodRow({ food }: { food: Food }) { const status = foodExpiryStatus(food.expiry); const alertClass = status.tone === 'normal' ? '' : `alert-${status.tone}`; return <div className={`food-row ${status.tone} ${alertClass}`.trim()}><span>{food.name}</span><span>{food.location}</span><time>{food.expiry}</time><span className={`chip ${status.tone === 'normal' ? 'sky' : status.tone}`}>{status.label}</span></div>; }
/** Side effects: none. */
function DataRow({ label, children }: { label: string; children: React.ReactNode }) { return <div className="data-row"><span>{label}</span>{children}</div>; }
