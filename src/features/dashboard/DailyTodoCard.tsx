import { useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { isCompletedToday, type DailyTodoItem } from './dailyTodos';
import { todayKey } from '../schedule/scheduleState';

type DailyTodoCardProps = {
  title: string;
  symbol: string;
  hint: string;
  items: DailyTodoItem[];
  onChange: Dispatch<SetStateAction<DailyTodoItem[]>>;
};

/** Side effects: delegates add/toggle/edit/delete to the persisted resource setter supplied by the parent. */
export function DailyTodoCard({ title, symbol, hint, items, onChange }: DailyTodoCardProps) {
  const [adding, setAdding] = useState(false);
  const today = todayKey();

  const toggle = (id: string) => onChange((list) => list.map((item) => item.id === id ? { ...item, completedOn: isCompletedToday(item, today) ? null : today } : item));
  const add = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get('title') ?? '').trim();
    if (!value || value.length > 200) return;
    onChange((list) => [...list, { id: crypto.randomUUID(), title: value, completedOn: null }]);
    event.currentTarget.reset();
    setAdding(false);
  };
  const save = (id: string, title: string) => onChange((list) => list.map((item) => item.id === id ? { ...item, title } : item));
  const remove = (id: string) => onChange((list) => list.filter((item) => item.id !== id));

  return (
    <section className="card">
      <h2>
        <span><span aria-hidden="true">{symbol}</span> {title}</span>
        <button className="add-button" aria-label={`新增 ${title} 条目`} onClick={() => setAdding((open) => !open)}>＋</button>
      </h2>
      <p className="small">{hint}</p>
      {adding && (
        <form className="inline-form" onSubmit={add}>
          <input name="title" maxLength={200} required placeholder="输入一条内容" aria-label={`新增 ${title} 内容`} autoFocus />
          <button type="submit">添加</button>
        </form>
      )}
      {items.length === 0 && !adding ? <p className="small">暂无内容，点右上角 ＋ 添加</p> : items.map((item) => (
        <DailyTodoRow key={item.id} item={item} today={today} onToggle={toggle} onSave={save} onDelete={remove} />
      ))}
    </section>
  );
}

/** Side effects: updates transient edit/error state and delegates persisted operations to DailyTodoCard. */
function DailyTodoRow({ item, today, onToggle, onSave, onDelete }: { item: DailyTodoItem; today: string; onToggle: (id: string) => void; onSave: (id: string, title: string) => void; onDelete: (id: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.title);
  const [error, setError] = useState('');
  const done = isCompletedToday(item, today);

  const start = () => { setDraft(item.title); setError(''); setEditing(true); };
  const cancel = () => { setDraft(item.title); setError(''); setEditing(false); };
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = draft.trim();
    if (!next) return setError('内容不能为空');
    if (next.length > 200) return setError('内容不能超过 200 字');
    onSave(item.id, next);
    setEditing(false);
    setError('');
  };

  if (editing) return (
    <form className="inline-form" onSubmit={save} onKeyDown={(event) => { if (event.key === 'Escape') cancel(); }}>
      <input value={draft} maxLength={200} onChange={(event) => setDraft(event.target.value)} aria-label={`编辑 ${item.title}`} autoFocus />
      <div className="watch-row-actions"><button type="submit">保存</button><button type="button" onClick={cancel}>取消</button></div>
      {error && <p className="status-message" role="alert">{error}</p>}
    </form>
  );

  return (
    <div className={done ? 'todo-row done' : 'todo-row'}>
      <button type="button" className="todo-check" onClick={() => onToggle(item.id)} aria-label={done ? `取消完成 ${item.title}` : `完成 ${item.title}`} aria-pressed={done}>✓</button>
      <span className="todo-title">{item.title}</span>
      <span className="watch-row-actions"><button type="button" onClick={start} aria-label={`编辑 ${item.title}`}>编辑</button><button type="button" className="danger" onClick={() => onDelete(item.id)} aria-label={`删除 ${item.title}`}>删除</button></span>
    </div>
  );
}
