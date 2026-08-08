import { useEffect, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { useDomainResource } from '../../shared/ipc/useDomainResource';
import { chinaMarketClock, fetchMarketQuotes, isChinaMarketSession } from '../../shared/ipc/marketQuote';
import { halfPositionReductionPrice, priceAlert, realizedProfitPercent, safetyDistancePercent, targetDistancePercent, unrealizedProfitPercent } from './tradeModel';
type Watch = { id: string; code: string; name: string; target: number; safety: number; current: number; quoteAt?: string };
type Position = { id: string; watchlistId: string; price: number; stop?: number; closePrice?: number; profitPercent?: number; closedAt?: string };
type Review = { date: string; content: string };
const initialWatch: Watch[] = [{ id: 'w1', code: '600519', name: '贵州茅台', target: 1680, safety: 1450, current: 1442 }, { id: 'w2', code: '002230', name: '科大讯飞', target: 40, safety: 34, current: 41.2 }];
const watchSchema = z.array(z.object({ id: z.string().min(1).max(100), code: z.string().regex(/^[A-Za-z0-9._-]{1,16}$/), name: z.string().min(1).max(100), target: z.number().positive(), safety: z.number().nonnegative(), current: z.number().nonnegative(), quoteAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/).optional() }).strict());
const positionSchema = z.array(z.object({ id: z.string().min(1).max(100), watchlistId: z.string().min(1).max(100), price: z.number().positive(), stop: z.number().positive().optional(), closePrice: z.number().positive().optional(), profitPercent: z.number().optional(), closedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).strict().refine((position) => [position.closePrice, position.profitPercent, position.closedAt].every((value) => value === undefined) || [position.closePrice, position.profitPercent, position.closedAt].every((value) => value !== undefined), '清仓字段必须同时存在'));
const reviewSchema = z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), content: z.string().min(1).max(1000) }).strict());
const sopSchema = z.string().min(1).max(500);
const initialSop = '观察列表 → 到达安全价 → 纪律建仓 → 策略卖出/止损 → 每日复盘';

/** Side effects: persists domain resources through typed IPC and requests fixed-host Sina A-share snapshots on add and during mainland trading windows. */
export function Trade() {
  const [watchlist, setWatchlist] = useDomainResource('trade.watchlist', watchSchema, initialWatch); const [positions, setPositions] = useDomainResource('trade.positions', positionSchema, [{ id: 'pos1', watchlistId: 'w2', price: 38.2 }] as Position[]); const [reviews, setReviews] = useDomainResource('trade.reviews', reviewSchema, [{ date: '2026-07-25', content: '大盘震荡，茅台触及安全价，暂不加仓观察量能' }] as Review[]); const [sop, setSop] = useDomainResource('trade.sop', sopSchema, initialSop); const [sopDraft, setSopDraft] = useState(initialSop); const [editingSop, setEditingSop] = useState(false); const [positionTab, setPositionTab] = useState<'active' | 'closed'>('active'); const [loadingQuote, setLoadingQuote] = useState(false); const [message, setMessage] = useState('');
  const watchCodes = watchlist.filter((item) => /^\d{6}$/.test(item.code)).map((item) => item.code).join(',');
  useEffect(() => {
    if (!watchCodes) return;
    let closedDate = '';
    let staleResponses = 0;
    const refresh = async () => {
      const now = new Date();
      if (!isChinaMarketSession(now)) return;
      const today = chinaMarketClock(now).date;
      if (closedDate === today) return;
      try {
        const quotes = await fetchMarketQuotes(watchCodes.split(','));
        const currentQuotes = new Map(quotes.filter((quote) => quote.quoteAt.startsWith(today)).map((quote) => [quote.code, quote]));
        if (!currentQuotes.size) { staleResponses += 1; if (staleResponses >= 3) closedDate = today; return setMessage(`新浪返回的是非当日行情，已保留最后成功价格${closedDate ? '；今日轮询已暂停' : ''}`); }
        staleResponses = 0;
        setWatchlist((items) => items.map((item) => { const quote = currentQuotes.get(item.code); return quote ? { ...item, current: quote.price, quoteAt: quote.quoteAt } : item; }));
        setMessage(`新浪行情已更新 · ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`);
      } catch (error) { setMessage(error instanceof Error ? `${error.message}，已保留最后成功价格` : '行情刷新失败，已保留最后成功价格'); }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(timer);
  }, [watchCodes, setWatchlist]);
  const addWatch = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const code = String(data.get('code') ?? '').trim(); const name = String(data.get('name') ?? '').trim(); const target = Number(data.get('target')); const safety = Number(data.get('safety')); if (!/^\d{6}$/.test(code) || !name || ![target, safety].every(Number.isFinite) || target <= 0 || safety < 0 || safety >= target) return setMessage('请填写六位 A 股代码、名称和有效价格，且安全价低于目标价'); if (watchlist.some((item) => item.code === code)) return setMessage('该代码已在观察列表'); setLoadingQuote(true); setMessage('正在读取新浪行情…'); try { const [quote] = await fetchMarketQuotes([code]); if (!quote) throw new Error('未找到该股票行情'); setWatchlist((items) => [...items, { id: crypto.randomUUID(), code, name, target, safety, current: quote.price, quoteAt: quote.quoteAt }]); form.reset(); setMessage(`已按新浪行情 ¥${quote.price.toFixed(2)} 加入观察列表`); } catch (error) { setMessage(error instanceof Error ? error.message : '新浪行情暂时不可用'); } finally { setLoadingQuote(false); } };
  const addPosition = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const watchlistId = String(data.get('watchlistId')); const price = Number(data.get('price')); if (!watchlist.some((item) => item.id === watchlistId) || !Number.isFinite(price) || price <= 0) return setMessage('持仓必须选择观察列表标的并填写有效建仓价'); setPositions((items) => [...items, { id: crypto.randomUUID(), watchlistId, price }]); form.reset(); setMessage('持仓已加入本次运行状态'); };
  const saveReview = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; const content = String(new FormData(form).get('content') ?? '').trim(); if (!content || content.length > 1000) return setMessage('复盘内容应为 1–1000 个字符'); const date = new Date().toLocaleDateString('sv-SE'); setReviews((items) => [{ date, content }, ...items.filter((item) => item.date !== date)]); form.reset(); setMessage('今日复盘已按日期更新（运行态）'); };
  const startSopEdit = () => { setSopDraft(sop); setEditingSop(true); setMessage(''); };
  const cancelSopEdit = () => { setSopDraft(sop); setEditingSop(false); };
  const saveSop = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const nextSop = sopDraft.trim(); if (!nextSop || nextSop.length > 500) return setMessage('投资 SOP 应为 1–500 个字符'); setSop(nextSop); setSopDraft(nextSop); setEditingSop(false); setMessage('投资 SOP 已保存'); };
  const updatePositionPrice = (positionId: string, price: number) => { setPositions((items) => items.map((item) => item.id === positionId ? { ...item, price } : item)); setMessage('建仓价已更新'); };
  const closePosition = (positionId: string, closePrice: number) => { setPositions((items) => items.map((item) => item.id === positionId && !item.closedAt ? { ...item, closePrice, profitPercent: realizedProfitPercent(item.price, closePrice), closedAt: new Date().toLocaleDateString('sv-SE') } : item)); setMessage('清仓记录已保存'); };
  const updateReview = (date: string, content: string) => { setReviews((items) => items.map((item) => item.date === date ? { ...item, content } : item)); setMessage('复盘已更新'); };
  const deleteReview = (date: string) => { setReviews((items) => items.filter((item) => item.date !== date)); setMessage('复盘已删除'); };
  const visiblePositions = positions.filter((position) => positionTab === 'closed' ? Boolean(position.closedAt) : !position.closedAt);
  return <div className="trade-view"><section className="card trade-sop"><div className="trade-sop-heading"><strong>投资 SOP</strong>{!editingSop && <button type="button" onClick={startSopEdit} aria-label="编辑投资 SOP">编辑</button>}</div>{editingSop ? <form onSubmit={saveSop}><label htmlFor="trade-sop-input" className="small">在当前位置修改投资纪律</label><textarea id="trade-sop-input" value={sopDraft} onChange={(event) => setSopDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') cancelSopEdit(); }} maxLength={500} autoFocus required /><div className="trade-sop-actions"><button className="command-button" type="submit">保存</button><button className="command-button" type="button" onClick={cancelSopEdit}>取消</button></div></form> : <p className="small trade-sop-content">{sop}</p>}</section>{message && <div role="status" className="status-message">{message}</div>}<section className="card trade-card"><h2><span>观察列表</span><span className="tag">新浪行情 · 60 秒刷新 · 不提供建议</span></h2><form className="compact-form" onSubmit={addWatch}><input name="code" placeholder="代码" required /><input name="name" placeholder="名称" required /><input name="target" type="number" step="0.01" placeholder="目标价" required /><input name="safety" type="number" step="0.01" placeholder="安全价" required /><button className="command-button" disabled={loadingQuote}>{loadingQuote ? '正在取价…' : '加入观察列表'}</button></form><div className="watch-head"><span>代码/名称</span><span>目标价</span><span>安全价</span><span>现价</span><span>状态</span></div>{watchlist.map((item) => <WatchRow item={item} key={item.id} />)}</section><section className="card trade-card"><h2><span>持仓管理</span><span className="tag">仅限观察列表选股</span></h2><form className="compact-form" onSubmit={addPosition}><WatchSelect items={watchlist} /><input name="price" type="number" step="0.01" min="0.01" required placeholder="建仓价" /><button className="command-button">分批建仓</button></form><div className="trade-position-tabs" role="tablist" aria-label="持仓列表"><button type="button" role="tab" aria-selected={positionTab === 'active'} onClick={() => setPositionTab('active')}>当前持仓</button><button type="button" role="tab" aria-selected={positionTab === 'closed'} onClick={() => setPositionTab('closed')}>已清仓</button></div>{positionTab === 'active' ? <><div className="position-head"><span>持仓</span><span>建仓价</span><span>盈亏</span><span>距目标价</span><span>距安全价</span><span>减仓价</span><span>操作</span></div>{visiblePositions.map((position) => { const item = watchlist.find((watch) => watch.id === position.watchlistId); return item ? <PositionRow item={item} position={position} onSavePrice={updatePositionPrice} onClose={closePosition} key={position.id} /> : null; })}</> : <><div className="closed-position-head"><span>股票</span><span>建仓价</span><span>清仓价</span><span>盈亏</span><span>清仓日期</span></div>{visiblePositions.map((position) => { const item = watchlist.find((watch) => watch.id === position.watchlistId); return item ? <ClosedPositionRow item={item} position={position} key={position.id} /> : null; })}</>}</section><section className="card"><h2>每日复盘（按日唯一）</h2><form className="review-form" onSubmit={saveReview}><input name="content" maxLength={1000} required placeholder="记录大盘/持仓观察，以及有无操作和逻辑" /><button className="command-button">保存今日复盘</button></form><div className="timeline">{reviews.map((review) => <ReviewRow review={review} onSave={updateReview} onDelete={deleteReview} key={review.date} />)}</div></section></div>;
}

/** Side effects: none. Renders values derived from the persisted position and latest watchlist quote. */
function PositionRow({ item, position, onSavePrice, onClose }: { item: Watch; position: Position; onSavePrice: (positionId: string, price: number) => void; onClose: (positionId: string, closePrice: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(position.price));
  const [closing, setClosing] = useState(false);
  const [closeDraft, setCloseDraft] = useState('');
  const targetDistance = targetDistancePercent(position.price, item.target);
  const safetyDistance = safetyDistancePercent(position.price, item.safety);
  const profitPercent = unrealizedProfitPercent(position.price, item.current);
  const reductionPrice = halfPositionReductionPrice(position.price, item.safety);
  const percent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  const cancel = () => { setDraft(String(position.price)); setEditing(false); };
  const save = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const price = Number(draft); if (!Number.isFinite(price) || price <= 0) return; onSavePrice(position.id, price); setDraft(String(price)); setEditing(false); };
  const cancelClose = () => { setCloseDraft(''); setClosing(false); };
  const saveClose = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const closePrice = Number(closeDraft); if (!Number.isFinite(closePrice) || closePrice <= 0) return; onClose(position.id, closePrice); cancelClose(); };
  return <div className="position-row"><strong className="mono">{item.code} {item.name}</strong>{editing ? <form className="position-price-editor" onSubmit={save}><label className="sr-only" htmlFor={`position-price-${position.id}`}>编辑 {item.name} 建仓价</label><input id={`position-price-${position.id}`} type="number" min="0.01" step="0.01" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') cancel(); }} autoFocus required /><button type="submit">保存</button><button type="button" onClick={cancel}>取消</button></form> : <span className="position-price">¥{position.price.toFixed(2)} <button type="button" onClick={() => { setDraft(String(position.price)); setEditing(true); }} aria-label={`编辑 ${item.name} 建仓价`}>编辑</button></span>}<span className={profitPercent >= 0 ? 'profit-positive' : 'profit-negative'}>{percent(profitPercent)}</span><span>{percent(targetDistance)}</span><span>{percent(safetyDistance)}</span><span>{reductionPrice === null ? '—' : `¥${reductionPrice.toFixed(2)}`}</span>{closing ? <form className="position-close-editor" onSubmit={saveClose}><label className="sr-only" htmlFor={`position-close-${position.id}`}>输入 {item.name} 清仓价</label><input id={`position-close-${position.id}`} type="number" min="0.01" step="0.01" value={closeDraft} onChange={(event) => setCloseDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') cancelClose(); }} autoFocus required /><button type="submit">确认</button><button type="button" onClick={cancelClose}>取消</button></form> : <button type="button" className="position-close-button" onClick={() => setClosing(true)} aria-label={`清仓 ${item.name}`}>清仓</button>}</div>;
}

/** Side effects: none. Renders one persisted closed-position snapshot. */
function ClosedPositionRow({ item, position }: { item: Watch; position: Position }) {
  return <div className="closed-position-row"><strong className="mono">{item.code} {item.name}</strong><span>¥{position.price.toFixed(2)}</span><span>¥{position.closePrice!.toFixed(2)}</span><span className={position.profitPercent! >= 0 ? 'profit-positive' : 'profit-negative'}>{position.profitPercent! >= 0 ? '+' : ''}{position.profitPercent!.toFixed(2)}%</span><time>{position.closedAt}</time></div>;
}

/** Side effects: updates transient edit state; delegates persisted save/delete operations to the parent. */
function ReviewRow({ review, onSave, onDelete }: { review: Review; onSave: (date: string, content: string) => void; onDelete: (date: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(review.content);
  const cancel = () => { setDraft(review.content); setEditing(false); };
  const save = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const content = draft.trim(); if (!content || content.length > 1000) return; onSave(review.date, content); setDraft(content); setEditing(false); };
  return <div className="timeline-item trade-review-item"><div className="timeline-meta">{review.date}</div>{editing ? <form className="trade-review-editor" onSubmit={save}><label className="sr-only" htmlFor={`trade-review-${review.date}`}>编辑 {review.date} 每日复盘</label><textarea id={`trade-review-${review.date}`} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') cancel(); }} maxLength={1000} autoFocus required /><div><button type="submit">保存</button><button type="button" onClick={cancel}>取消</button></div></form> : <><div className="timeline-title trade-review-content">{review.content}</div><div className="trade-review-actions"><button type="button" onClick={() => { setDraft(review.content); setEditing(true); }} aria-label={`编辑 ${review.date} 每日复盘`}>编辑</button><button type="button" className="danger" onClick={() => onDelete(review.date)} aria-label={`删除 ${review.date} 每日复盘`}>删除</button></div></>}</div>;
}
/** Side effects: updates transient selection/open state only; submits the selected stable watchlist ID through its parent form. */
function WatchSelect({ items }: { items: Watch[] }) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? '');
  useEffect(() => { if (!items.some((item) => item.id === selectedId)) setSelectedId(items[0]?.id ?? ''); }, [items, selectedId]);
  const selectedIndex = Math.max(0, items.findIndex((item) => item.id === selectedId));
  const selected = items[selectedIndex];
  const move = (offset: number) => { if (!items.length) return; const next = (selectedIndex + offset + items.length) % items.length; setSelectedId(items[next].id); setOpen(true); };
  return <span className="trade-select" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <input type="hidden" name="watchlistId" value={selectedId} />
    <button type="button" className="trade-select-trigger" aria-label="观察列表标的" aria-haspopup="listbox" aria-expanded={open} aria-controls="position-watchlist-options" onClick={() => setOpen((value) => !value)} onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); move(1); } else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); } else if (event.key === 'Escape') { event.preventDefault(); setOpen(false); } }}>
      <span>{selected ? `${selected.code} ${selected.name}` : '暂无观察标的'}</span><span aria-hidden="true">⌄</span>
    </button>
    {open && <span className="trade-select-options" role="listbox" id="position-watchlist-options" aria-label="观察列表标的选项">{items.map((item) => <button type="button" role="option" aria-selected={item.id === selectedId} className={item.id === selectedId ? 'selected' : ''} onClick={() => { setSelectedId(item.id); setOpen(false); }} key={item.id}><span>{item.code}</span><strong>{item.name}</strong>{item.id === selectedId && <span aria-hidden="true">✓</span>}</button>)}</span>}
  </span>;
}
/** Side effects: none. */
function WatchRow({ item }: { item: Watch }) { const alert = priceAlert(item.current, item.target, item.safety); const alertClass = alert === 'target' ? 'alert-crimson' : alert === 'safety' ? 'alert-sky' : ''; return <div className={`watch-row ${alert} ${alertClass}`.trim()}><strong>{item.code} {item.name}{item.quoteAt && <small>新浪 · {item.quoteAt.replace('T', ' ')}</small>}</strong><span>¥{item.target}</span><span>¥{item.safety}</span><span>¥{item.current.toFixed(2)}</span><span className={`chip ${alert === 'target' ? 'crimson' : alert === 'safety' ? 'sky' : 'amber'}`}>{alert === 'target' ? '已达目标价' : alert === 'safety' ? '已跌破安全价' : '观察中'}</span></div>; }
