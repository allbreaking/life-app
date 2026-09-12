import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { z } from 'zod';
import { useDomainResource } from '../../shared/ipc/useDomainResource';
import { fetchMarketQuotes } from '../../shared/ipc/marketQuote';
import { addTradeWatch, subscribeTradeWatchAdded } from '../../shared/ipc/tradeWatch';
import { centralTargetDistanceFromCurrentPercent, filterWatchlist, halfPositionReductionPrice, isValidTargetPrices, isValidTargetRange, normalizeWatch, paginateWatchlist, parseOptionalWatchRating, parseWatchTags, priceAlert, realizedProfitPercent, safetyDistancePercent, searchWatchlist, searchWatchlistByCode, sortWatchlistByRating, sortWatchlistNewestFirst, targetDistancePercent, unrealizedProfitPercent, type WatchFilter, type WatchRatingKey } from './tradeModel';
type WatchRatings = Partial<Record<WatchRatingKey, number>>;
type Watch = { id: string; code: string; name: string; optimisticTarget: number; target: number; pessimisticTarget: number; safety: number; current: number; tags: string[]; quoteAt?: string; createdAt?: string } & WatchRatings;
type WatchDraft = Pick<Watch, 'code' | 'name' | 'optimisticTarget' | 'target' | 'pessimisticTarget' | 'safety'> & WatchRatings & { tags: string };
type Position = { id: string; watchlistId: string; price: number; stop?: number; closePrice?: number; profitPercent?: number; closedAt?: string };
type Review = { date: string; content: string };
const initialWatch: Watch[] = import.meta.env.PROD ? [] : [{ id: 'w1', code: '600519', name: '贵州茅台', optimisticTarget: 1800, target: 1680, pessimisticTarget: 1550, safety: 1450, current: 1442, tags: ['消费', '核心资产'], businessModelRating: 5, profitabilityRating: 5, financialStabilityRating: 5, cashFlowRating: 5, createdAt: '2026-08-28T08:00:00.000Z' }, { id: 'w2', code: '002230', name: '科大讯飞', optimisticTarget: 45, target: 40, pessimisticTarget: 36, safety: 34, current: 41.2, tags: ['AI'], businessModelRating: 3, profitabilityRating: 2, financialStabilityRating: 3, cashFlowRating: 1, createdAt: '2026-08-29T08:00:00.000Z' }];
const ratingSchema = z.number().int().min(0).max(5).optional();
const watchSchema = z.array(z.object({ id: z.string().min(1).max(100), code: z.string().regex(/^[A-Za-z0-9._-]{1,16}$/), name: z.string().min(1).max(100), optimisticTarget: z.number().positive().optional(), target: z.number().positive(), pessimisticTarget: z.number().positive().optional(), safety: z.number().nonnegative(), current: z.number().nonnegative(), tags: z.array(z.string().trim().min(1).max(20)).max(10).optional(), businessModelRating: ratingSchema, profitabilityRating: ratingSchema, financialStabilityRating: ratingSchema, cashFlowRating: ratingSchema, cashFlowDividendRating: ratingSchema, valuationRating: ratingSchema, quoteAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/).optional(), createdAt: z.string().datetime().optional() }).strict().transform(normalizeWatch).refine((item) => isValidTargetRange(item.optimisticTarget, item.target, item.pessimisticTarget, item.safety), '观察列表价格关系无效'));
const positionSchema = z.array(z.object({ id: z.string().min(1).max(100), watchlistId: z.string().min(1).max(100), price: z.number().positive(), stop: z.number().positive().optional(), closePrice: z.number().positive().optional(), profitPercent: z.number().optional(), closedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).strict().refine((position) => [position.closePrice, position.profitPercent, position.closedAt].every((value) => value === undefined) || [position.closePrice, position.profitPercent, position.closedAt].every((value) => value !== undefined), '清仓字段必须同时存在'));
const reviewSchema = z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), content: z.string().min(1).max(1000) }).strict());
const sopSchema = z.string().max(500);
const initialSop = import.meta.env.PROD ? '' : '观察列表 → 到达安全价 → 纪律建仓 → 策略卖出/止损 → 每日复盘';
const watchFilters: { value: WatchFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'target', label: '已达中枢目标价' },
  { value: 'watching', label: '观察中' },
  { value: 'safety', label: '已跌破安全价' },
];
const watchRatingFields: { key: WatchRatingKey; label: string }[] = [
  { key: 'businessModelRating', label: '商业模式' },
  { key: 'profitabilityRating', label: '盈利能力' },
  { key: 'financialStabilityRating', label: '财务稳定性' },
  { key: 'cashFlowRating', label: '现金流' },
];
const WATCH_PAGE_SIZE = 10;

/** Spec: trade-watch-ratings. Side effects: none. Parses the four optional form ratings as one atomic value. */
function parseWatchRatings(data: FormData): WatchRatings | null {
  const entries = watchRatingFields.map(({ key }) => [key, parseOptionalWatchRating(String(data.get(key) ?? ''))] as const);
  if (entries.some(([, value]) => value === null)) return null;
  return Object.fromEntries(entries.filter(([, value]) => value !== undefined)) as WatchRatings;
}

/** Specs: trade-watch-target-range, trade-watch-inline-management, trade-watch-filter-pagination, and trade-watch-tags. Side effects: persists domain resources through typed IPC, requests fixed-host Sina A-share snapshots, and updates transient filter/page state. */
export function Trade() {
  const [watchlist, setWatchlist] = useDomainResource('trade.watchlist', watchSchema, initialWatch); const [positions, setPositions] = useDomainResource('trade.positions', positionSchema, (import.meta.env.PROD ? [] : [{ id: 'pos1', watchlistId: 'w2', price: 38.2 }]) as Position[]); const [reviews, setReviews] = useDomainResource('trade.reviews', reviewSchema, (import.meta.env.PROD ? [] : [{ date: '2026-07-25', content: '大盘震荡，茅台触及安全价，暂不加仓观察量能' }]) as Review[]); const [sop, setSop] = useDomainResource('trade.sop', sopSchema, initialSop); const [sopDraft, setSopDraft] = useState(initialSop); const [editingSop, setEditingSop] = useState(false); const [positionTab, setPositionTab] = useState<'active' | 'closed'>('active'); const [watchFilter, setWatchFilter] = useState<WatchFilter>('all'); const [watchTagFilter, setWatchTagFilter] = useState(''); const [watchQuery, setWatchQuery] = useState(''); const [watchRatingSortKey, setWatchRatingSortKey] = useState<WatchRatingKey | ''>(''); const [watchRatingSortDirection, setWatchRatingSortDirection] = useState<'asc' | 'desc'>('desc'); const [watchPageNumber, setWatchPageNumber] = useState(1); const [loadingQuote, setLoadingQuote] = useState(false); const [refreshing, setRefreshing] = useState(false); const [message, setMessage] = useState('');
  const watchCodes = watchlist.filter((item) => /^\d{5,6}$/.test(item.code)).map((item) => item.code).join(',');
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void subscribeTradeWatchAdded((watch) => {
      setWatchlist((items) => items.some((item) => item.id === watch.id)
        ? items.map((item) => item.id === watch.id ? watch : item)
        : [...items, watch]);
    }).then((stop) => { if (disposed) stop(); else unlisten = stop; });
    return () => { disposed = true; unlisten?.(); };
  }, [setWatchlist]);
  const refreshQuotes = async () => {
    if (!watchCodes) return setMessage('观察列表为空，无法刷新');
    setRefreshing(true);
    setMessage('正在读取新浪行情…');
    try {
      const quotes = await fetchMarketQuotes(watchCodes.split(','));
      const quoteMap = new Map(quotes.map((quote) => [quote.code, quote]));
      if (!quoteMap.size) return setMessage('未获取到有效行情，已保留原价');
      setWatchlist((items) => items.map((item) => { const quote = quoteMap.get(item.code); return quote ? { ...item, current: quote.price, quoteAt: quote.quoteAt } : item; }));
      setMessage(`已刷新 ${quoteMap.size} 个标的行情 · ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`);
    } catch (error) { setMessage(error instanceof Error ? `${error.message}，已保留原价` : '行情刷新失败，已保留原价'); } finally { setRefreshing(false); }
  };
  const addWatch = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const code = String(data.get('code') ?? '').trim(); const name = String(data.get('name') ?? '').trim(); const tags = parseWatchTags(String(data.get('tags') ?? '')); const ratings = parseWatchRatings(data); const optimisticTarget = Number(data.get('optimisticTarget')); const target = Number(data.get('target')); const pessimisticTarget = Number(data.get('pessimisticTarget')); if (tags === null) return setMessage('标签最多 10 个，每个最多 20 个字符'); if (ratings === null) return setMessage('四项评分均应为 0–5 的整数或留空'); if (!/^\d{5,6}$/.test(code) || !name || !isValidTargetPrices(optimisticTarget, target, pessimisticTarget)) return setMessage('请填写六位 A 股或五位港股代码、名称和有效价格，且满足乐观目标价 ≥ 中枢目标价 ≥ 悲观目标价 > 0'); if (watchlist.some((item) => item.code === code)) return setMessage('该代码已在观察列表'); setLoadingQuote(true); setMessage('正在读取新浪行情…'); try { const watch = await addTradeWatch({ requestId: crypto.randomUUID(), code, name, optimisticTarget, target, pessimisticTarget, tags, ...ratings }); setWatchlist((items) => items.some((item) => item.id === watch.id) ? items : [...items, watch]); form.reset(); setMessage(`已按新浪行情 ¥${watch.current.toFixed(2)} 加入观察列表`); } catch (error) { setMessage(error instanceof Error ? error.message : '新浪行情暂时不可用'); } finally { setLoadingQuote(false); } };
  const addPosition = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const watchlistId = String(data.get('watchlistId')); const price = Number(data.get('price')); if (!watchlist.some((item) => item.id === watchlistId) || !Number.isFinite(price) || price <= 0) return setMessage('持仓必须选择观察列表标的并填写有效建仓价'); setPositions((items) => [...items, { id: crypto.randomUUID(), watchlistId, price }]); form.reset(); setMessage('持仓已加入本次运行状态'); };
  const saveReview = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; const content = String(new FormData(form).get('content') ?? '').trim(); if (!content || content.length > 1000) return setMessage('复盘内容应为 1–1000 个字符'); const date = new Date().toLocaleDateString('sv-SE'); setReviews((items) => [{ date, content }, ...items.filter((item) => item.date !== date)]); form.reset(); setMessage('今日复盘已按日期更新（运行态）'); };
  const startSopEdit = () => { setSopDraft(sop); setEditingSop(true); setMessage(''); };
  const cancelSopEdit = () => { setSopDraft(sop); setEditingSop(false); };
  const saveSop = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const nextSop = sopDraft.trim(); if (!nextSop || nextSop.length > 500) return setMessage('投资 SOP 应为 1–500 个字符'); setSop(nextSop); setSopDraft(nextSop); setEditingSop(false); setMessage('投资 SOP 已保存'); };
  const updatePositionPrice = (positionId: string, price: number) => { setPositions((items) => items.map((item) => item.id === positionId ? { ...item, price } : item)); setMessage('建仓价已更新'); };
  const closePosition = (positionId: string, closePrice: number) => { setPositions((items) => items.map((item) => item.id === positionId && !item.closedAt ? { ...item, closePrice, profitPercent: realizedProfitPercent(item.price, closePrice), closedAt: new Date().toLocaleDateString('sv-SE') } : item)); setMessage('清仓记录已保存'); };
  const deletePosition = (positionId: string, kind: 'active' | 'closed') => { setPositions((items) => items.filter((item) => item.id !== positionId)); setMessage(kind === 'closed' ? '清仓记录已删除' : '持仓已删除'); };
  const updateWatch = async (watchId: string, draft: WatchDraft): Promise<string | null> => {
    const original = watchlist.find((item) => item.id === watchId);
    if (!original) { const error = '观察标的不存在，请刷新后重试'; setMessage(error); return error; }
    const tags = parseWatchTags(draft.tags);
    if (tags === null) { const error = '标签最多 10 个，每个最多 20 个字符'; setMessage(error); return error; }
    if (watchRatingFields.some(({ key }) => draft[key] !== undefined && (!Number.isInteger(draft[key]) || draft[key]! < 0 || draft[key]! > 5))) { const error = '四项评分均应为 0–5 的整数或留空'; setMessage(error); return error; }
    if (!/^\d{5,6}$/.test(draft.code) || !draft.name || draft.name.length > 100 || !isValidTargetRange(draft.optimisticTarget, draft.target, draft.pessimisticTarget, draft.safety)) { const error = '请填写六位 A 股或五位港股代码、1–100 字名称和有效价格，且满足乐观目标价 ≥ 中枢目标价 ≥ 悲观目标价，安全价低于中枢目标价'; setMessage(error); return error; }
    if (watchlist.some((item) => item.id !== watchId && item.code === draft.code)) { const error = '该代码已在观察列表'; setMessage(error); return error; }
    try {
      let quote: { price: number; quoteAt: string } | undefined;
      if (draft.code !== original.code) {
        setMessage('代码已修改，正在读取新浪行情…');
        const [nextQuote] = await fetchMarketQuotes([draft.code]);
        if (!nextQuote) throw new Error('未找到该股票行情');
        quote = nextQuote;
      }
      const watchDraft = { code: draft.code, name: draft.name, optimisticTarget: draft.optimisticTarget, target: draft.target, pessimisticTarget: draft.pessimisticTarget, safety: draft.safety, ...Object.fromEntries(watchRatingFields.map(({ key }) => [key, draft[key]])) };
      setWatchlist((items) => items.map((item) => item.id === watchId ? { ...item, ...watchDraft, tags, current: quote?.price ?? item.current, quoteAt: quote?.quoteAt ?? item.quoteAt } : item));
      setMessage('观察标的已更新');
      return null;
    } catch (error) {
      const reason = error instanceof Error ? `${error.message}，原观察标的已保留` : '新浪行情暂时不可用，原观察标的已保留';
      setMessage(reason);
      return reason;
    }
  };
  const deleteWatch = (watchId: string) => {
    const item = watchlist.find((watch) => watch.id === watchId);
    if (!item) return setMessage('观察标的不存在，请刷新后重试');
    if (positions.some((position) => position.watchlistId === watchId)) return setMessage(`${item.name} 仍有关联持仓或清仓记录，不能删除`);
    setWatchlist((items) => items.filter((watch) => watch.id !== watchId));
    setMessage('观察标的已删除');
  };
  const updateReview = (date: string, content: string) => { setReviews((items) => items.map((item) => item.date === date ? { ...item, content } : item)); setMessage('复盘已更新'); };
  const deleteReview = (date: string) => { setReviews((items) => items.filter((item) => item.date !== date)); setMessage('复盘已删除'); };
  const availableWatchTags = [...new Set(watchlist.flatMap((item) => item.tags))];
  useEffect(() => { if (watchTagFilter && !availableWatchTags.includes(watchTagFilter)) { setWatchTagFilter(''); setWatchPageNumber(1); } }, [availableWatchTags, watchTagFilter]);
  const filteredWatchlist = filterWatchlist(searchWatchlist(watchlist, watchQuery), watchFilter, watchTagFilter);
  const newestWatchlist = sortWatchlistNewestFirst(filteredWatchlist);
  const sortedWatchlist = sortWatchlistByRating(newestWatchlist, watchRatingSortKey ? { key: watchRatingSortKey, direction: watchRatingSortDirection } : null);
  const watchPage = paginateWatchlist(sortedWatchlist, watchPageNumber, WATCH_PAGE_SIZE);
  const visiblePositions = positions.filter((position) => positionTab === 'closed' ? Boolean(position.closedAt) : !position.closedAt);
  return <div className="trade-view">
    <section className="card trade-sop">
      <div className="trade-sop-heading"><strong>投资 SOP</strong>{!editingSop && <button type="button" onClick={startSopEdit} aria-label="编辑投资 SOP">编辑</button>}</div>
      {editingSop ? <form onSubmit={saveSop}><label htmlFor="trade-sop-input" className="small">在当前位置修改投资纪律</label><textarea id="trade-sop-input" value={sopDraft} onChange={(event) => setSopDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') cancelSopEdit(); }} maxLength={500} autoFocus required /><div className="trade-sop-actions"><button className="command-button" type="submit">保存</button><button className="command-button" type="button" onClick={cancelSopEdit}>取消</button></div></form> : <p className="small trade-sop-content">{sop}</p>}
    </section>
    {message && <div role="status" className="status-message">{message}</div>}
    <section className="card trade-card">
      <h2><span>观察列表</span><span className="tag">新浪行情 · 手动刷新 · 不提供建议</span><button type="button" className="command-button" onClick={() => void refreshQuotes()} disabled={refreshing} aria-label="刷新观察列表行情">{refreshing ? '刷新中…' : '刷新行情'}</button></h2>
      <form className="compact-form watch-add-form" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, alignItems: 'end' }} onSubmit={addWatch}>
        <WatchAddField label="股票代码"><input name="code" placeholder="六位A股 / 五位港股" style={{ width: '100%' }} required /></WatchAddField>
        <WatchAddField label="股票名称"><input name="name" placeholder="名称" style={{ width: '100%' }} required /></WatchAddField>
        <WatchAddField label="标签" span={2}><input name="tags" placeholder="多个标签用逗号分隔" aria-label="观察标的标签" style={{ width: '100%' }} /></WatchAddField>
        <span style={{ display: 'grid', gridColumn: '1 / -1', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
          <WatchAddField label="乐观目标价"><input name="optimisticTarget" type="number" min="0.01" step="0.01" placeholder="0.00" style={{ width: '100%' }} required /></WatchAddField>
          <WatchAddField label="中枢目标价"><input name="target" type="number" min="0.01" step="0.01" placeholder="0.00" style={{ width: '100%' }} required /></WatchAddField>
          <WatchAddField label="悲观目标价"><input name="pessimisticTarget" type="number" min="0.01" step="0.01" placeholder="0.00" style={{ width: '100%' }} required /></WatchAddField>
        </span>
        <WatchRatingInputs />
        <button className="command-button" style={{ gridColumn: '4', justifySelf: 'end', background: 'var(--accent-tint)', color: 'var(--accent-deep)' }} disabled={loadingQuote}>{loadingQuote ? '正在取价…' : '加入观察列表'}</button>
      </form>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, margin: '2px 0 8px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <label><span className="sr-only">按股票代码或名称搜索观察列表</span><input type="search" style={{ width: 150, padding: '6px 9px', border: 0, borderRadius: 16, background: '#f1f5f9' }} value={watchQuery} onChange={(event) => { setWatchQuery(event.target.value); setWatchPageNumber(1); }} placeholder="搜索代码或名称" /></label>
          <div role="group" aria-label="观察列表状态筛选" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{watchFilters.map((filter) => <button type="button" aria-pressed={watchFilter === filter.value} style={{ padding: '6px 10px', border: 0, borderRadius: 16, background: watchFilter === filter.value ? 'var(--accent-tint)' : '#f1f5f9', color: watchFilter === filter.value ? 'var(--accent-deep)' : 'var(--text-dim)', fontSize: 10.5, fontWeight: watchFilter === filter.value ? 700 : 400 }} onClick={() => { setWatchFilter(filter.value); setWatchPageNumber(1); }} key={filter.value}>{filter.label}</button>)}</div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span className="small">标签</span><select aria-label="按标签筛选" style={{ padding: '6px 9px', border: 0, borderRadius: 16, background: '#f1f5f9', color: 'var(--text-strong)' }} value={watchTagFilter} onChange={(event) => { setWatchTagFilter(event.target.value); setWatchPageNumber(1); }}><option value="">全部标签</option>{availableWatchTags.map((tag) => <option value={tag} key={tag}>{tag}</option>)}</select></label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span className="small">排序</span><select aria-label="按评分维度排序" style={{ padding: '6px 9px', border: 0, borderRadius: 16, background: '#f1f5f9', color: 'var(--text-strong)' }} value={watchRatingSortKey} onChange={(event) => { setWatchRatingSortKey(event.target.value as WatchRatingKey | ''); setWatchPageNumber(1); }}><option value="">最新加入</option>{watchRatingFields.map(({ key, label }) => <option value={key} key={key}>{label}</option>)}</select></label>
          <button type="button" disabled={!watchRatingSortKey} aria-label="切换评分排序方向" style={{ padding: '6px 9px', border: 0, borderRadius: 16, background: watchRatingSortKey ? 'var(--accent-tint)' : '#f1f5f9', color: watchRatingSortKey ? 'var(--accent-deep)' : 'var(--text-dim)', fontSize: 10.5 }} onClick={() => { setWatchRatingSortDirection((current) => current === 'desc' ? 'asc' : 'desc'); setWatchPageNumber(1); }}>{watchRatingSortDirection === 'desc' ? '高 → 低' : '低 → 高'}</button>
        </div>
        <span className="small">{watchPage.total} 个标的</span>
      </div>
      <div className="watch-head"><span>代码/名称/标签</span><span>乐观目标价</span><span>中枢目标价</span><span>悲观目标价</span><span>现价 / 距目标</span><span>四维评分</span><span>状态/操作</span></div>
      {watchPage.items.map((item) => <WatchRow item={item} onSave={updateWatch} onDelete={deleteWatch} key={item.id} />)}
      {watchPage.total === 0 && <p className="small" style={{ padding: 16, textAlign: 'center' }}>暂无符合条件的观察标的</p>}
      <nav aria-label="观察列表分页" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}><button className="command-button" type="button" disabled={watchPage.page === 1} onClick={() => setWatchPageNumber(watchPage.page - 1)}>上一页</button><span className="small">第 {watchPage.page} / {watchPage.pageCount} 页</span><button className="command-button" type="button" disabled={watchPage.page === watchPage.pageCount} onClick={() => setWatchPageNumber(watchPage.page + 1)}>下一页</button></nav>
    </section>
    <section className="card trade-card">
      <h2><span>持仓管理</span><span className="tag">仅限观察列表选股</span></h2>
      <form className="compact-form" onSubmit={addPosition}><WatchSelect items={watchlist} /><input name="price" type="number" step="0.01" min="0.01" required placeholder="建仓价" /><button className="command-button">分批建仓</button></form>
      <div className="trade-position-tabs" role="tablist" aria-label="持仓列表"><button type="button" role="tab" aria-selected={positionTab === 'active'} onClick={() => setPositionTab('active')}>当前持仓</button><button type="button" role="tab" aria-selected={positionTab === 'closed'} onClick={() => setPositionTab('closed')}>已清仓</button></div>
      {positionTab === 'active' ? <><div className="position-head"><span>持仓</span><span>建仓价</span><span>盈亏</span><span>距中枢目标价</span><span>距安全价</span><span>减仓价</span><span>操作</span></div>{visiblePositions.map((position) => { const item = watchlist.find((watch) => watch.id === position.watchlistId); return item ? <PositionRow item={item} position={position} onSavePrice={updatePositionPrice} onClose={closePosition} onDelete={() => deletePosition(position.id, 'active')} key={position.id} /> : null; })}</> : <><div className="closed-position-head"><span>股票</span><span>建仓价</span><span>清仓价</span><span>盈亏</span><span>清仓日期</span><span>操作</span></div>{visiblePositions.map((position) => { const item = watchlist.find((watch) => watch.id === position.watchlistId); return item ? <ClosedPositionRow item={item} position={position} onDelete={() => deletePosition(position.id, 'closed')} key={position.id} /> : null; })}</>}
    </section>
    <section className="card"><h2>每日复盘（按日唯一）</h2><form className="review-form" onSubmit={saveReview}><input name="content" maxLength={1000} required placeholder="记录大盘/持仓观察，以及有无操作和逻辑" /><button className="command-button">保存今日复盘</button></form><div className="timeline">{reviews.map((review) => <ReviewRow review={review} onSave={updateReview} onDelete={deleteReview} key={review.date} />)}</div></section>
  </div>;
}

/** Spec: docs/specs/trade-watch-target-range/01-watch-target-range.spec.md (2026-08-09). Side effects: none. Renders values derived from the persisted position and latest watchlist quote. */
function PositionRow({ item, position, onSavePrice, onClose, onDelete }: { item: Watch; position: Position; onSavePrice: (positionId: string, price: number) => void; onClose: (positionId: string, closePrice: number) => void; onDelete: () => void }) {
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
  return <div className="position-row"><strong className="mono">{item.code} {item.name}</strong>{editing ? <form className="position-price-editor" onSubmit={save}><label className="sr-only" htmlFor={`position-price-${position.id}`}>编辑 {item.name} 建仓价</label><input id={`position-price-${position.id}`} type="number" min="0.01" step="0.01" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') cancel(); }} autoFocus required /><button type="submit">保存</button><button type="button" onClick={cancel}>取消</button></form> : <span className="position-price">¥{position.price.toFixed(2)} <button type="button" onClick={() => { setDraft(String(position.price)); setEditing(true); }} aria-label={`编辑 ${item.name} 建仓价`}>编辑</button></span>}<span className={profitPercent >= 0 ? 'profit-positive' : 'profit-negative'}>{percent(profitPercent)}</span><span>{percent(targetDistance)}</span><span>{percent(safetyDistance)}</span><span>{reductionPrice === null ? '—' : `¥${reductionPrice.toFixed(2)}`}</span>{closing ? <form className="position-close-editor" onSubmit={saveClose}><label className="sr-only" htmlFor={`position-close-${position.id}`}>输入 {item.name} 清仓价</label><input id={`position-close-${position.id}`} type="number" min="0.01" step="0.01" value={closeDraft} onChange={(event) => setCloseDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') cancelClose(); }} autoFocus required /><button type="submit">确认</button><button type="button" onClick={cancelClose}>取消</button></form> : <span className="position-row-actions"><button type="button" className="position-close-button" onClick={() => setClosing(true)} aria-label={`清仓 ${item.name}`}>清仓</button><button type="button" className="position-delete-button" onClick={onDelete} aria-label={`删除 ${item.name} 持仓`}>删除</button></span>}</div>;
}

/** Side effects: delegates a stable-ID delete request to the parent. */
function ClosedPositionRow({ item, position, onDelete }: { item: Watch; position: Position; onDelete: () => void }) {
  return <div className="closed-position-row"><strong className="mono">{item.code} {item.name}</strong><span>¥{position.price.toFixed(2)}</span><span>¥{position.closePrice!.toFixed(2)}</span><span className={position.profitPercent! >= 0 ? 'profit-positive' : 'profit-negative'}>{position.profitPercent! >= 0 ? '+' : ''}{position.profitPercent!.toFixed(2)}%</span><time>{position.closedAt}</time><button type="button" className="position-delete-button" onClick={onDelete} aria-label={`删除 ${item.name} 清仓记录`}>删除</button></div>;
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
  const [query, setQuery] = useState('');
  useEffect(() => { if (!items.some((item) => item.id === selectedId)) setSelectedId(items[0]?.id ?? ''); }, [items, selectedId]);
  const selected = items.find((item) => item.id === selectedId);
  const filteredItems = searchWatchlistByCode(items, query);
  const filteredSelectedIndex = filteredItems.findIndex((item) => item.id === selectedId);
  const move = (offset: number) => { if (!filteredItems.length) return; const start = filteredSelectedIndex < 0 ? (offset > 0 ? -1 : 0) : filteredSelectedIndex; const next = (start + offset + filteredItems.length) % filteredItems.length; setSelectedId(filteredItems[next].id); setOpen(true); };
  const close = () => { setOpen(false); setQuery(''); };
  return <span className="trade-select" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close(); }}>
    <input type="hidden" name="watchlistId" value={selectedId} />
    <button type="button" className="trade-select-trigger" aria-label="观察列表标的" aria-haspopup="listbox" aria-expanded={open} aria-controls="position-watchlist-options" onClick={() => { if (open) close(); else setOpen(true); }} onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); move(1); } else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); } else if (event.key === 'Escape') { event.preventDefault(); close(); } }}>
      <span>{selected ? `${selected.code} ${selected.name}` : '暂无观察标的'}</span><span aria-hidden="true">⌄</span>
    </button>
    {open && <span className="trade-select-options" style={{ width: 260 }}><label><span className="sr-only">按股票代码搜索持仓标的</span><input type="search" style={{ width: '100%', padding: '8px 9px', border: 0, borderRadius: 7, background: '#f8fafc' }} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); move(1); } else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); } else if (event.key === 'Escape') { event.preventDefault(); close(); } }} placeholder="搜索股票代码" autoFocus /></label><span style={{ display: 'contents' }} role="listbox" id="position-watchlist-options" aria-label="观察列表标的选项">{filteredItems.map((item) => <button type="button" role="option" aria-selected={item.id === selectedId} className={item.id === selectedId ? 'selected' : ''} onClick={() => { setSelectedId(item.id); close(); }} key={item.id}><span>{item.code}</span><strong>{item.name}</strong>{item.id === selectedId && <span aria-hidden="true">✓</span>}</button>)}</span>{filteredItems.length === 0 && <span className="small" style={{ padding: 12, textAlign: 'center' }}>无匹配股票代码</span>}</span>}
  </span>;
}

/** Side effects: none. Displays the latest quote and all three target distances. */
function WatchCurrentPrice({ item }: { item: Watch }) {
  const distances = [
    ['乐观', item.optimisticTarget],
    ['中枢', item.target],
    ['悲观', item.pessimisticTarget],
  ] as const;
  return <span style={{ display: 'grid', gap: 2 }}><span>¥{item.current.toFixed(2)}</span>{distances.map(([name, target]) => {
    const distance = centralTargetDistanceFromCurrentPercent(item.current, target);
    const label = Number.isFinite(distance) ? `${distance >= 0 ? '+' : ''}${distance.toFixed(2)}%` : '—';
    return <small className={`small mono ${distance < 0 ? 'profit-negative' : ''}`.trim()} key={name}>距{name} {label}</small>;
  })}</span>;
}

/** Side effects: none. Provides the shared visual structure for watch creation fields. */
function WatchAddField({ label, span = 1, children }: { label: string; span?: number; children: ReactNode }) {
  return <label style={{ display: 'grid', gridColumn: `span ${span}`, gap: 5, color: 'var(--text-dim)', fontSize: 10.5 }}><span>{label}</span>{children}</label>;
}

/** Spec: trade-watch-ratings. Side effects: none for add mode; edit mode delegates transient draft updates. */
function WatchRatingInputs({ itemName, values, onChange }: { itemName?: string; values?: WatchRatings; onChange?: (key: WatchRatingKey, value: number | undefined) => void }) {
  const editing = Boolean(onChange);
  return <span style={{ display: 'grid', gridColumn: editing ? undefined : '1 / -1', gridTemplateColumns: editing ? '1fr' : 'repeat(4, minmax(0, 1fr))', gap: editing ? 3 : 10 }}>{watchRatingFields.map(({ key, label }) => <label style={{ display: 'grid', gridTemplateColumns: editing ? '1fr 76px' : undefined, alignItems: 'center', gap: 5, color: 'var(--text-dim)', fontSize: 10.5 }} key={key}><span>{label}</span><span style={{ position: 'relative', display: 'block' }}><select name={key} aria-label={itemName ? `编辑 ${itemName} ${label}评分` : `${label}评分`} style={{ width: '100%', padding: editing ? '6px 24px 6px 8px' : '9px 30px 9px 12px', border: 0, borderRadius: 9, outline: 0, appearance: 'none', background: editing ? '#fff' : '#f8fafc', color: 'var(--text-strong)', fontSize: editing ? 10.5 : 12, cursor: 'pointer' }} value={onChange ? values?.[key] ?? '' : undefined} defaultValue={onChange ? undefined : ''} onChange={onChange ? (event) => onChange(key, parseOptionalWatchRating(event.target.value) ?? undefined) : undefined}><option value="">未评分</option>{[0, 1, 2, 3, 4, 5].map((rating) => <option value={rating} key={rating}>{rating} 星</option>)}</select><span aria-hidden="true" style={{ position: 'absolute', top: '50%', right: 10, color: 'var(--accent-deep)', fontSize: 13, lineHeight: 1, pointerEvents: 'none', transform: 'translateY(-55%)' }}>⌄</span></span></label>)}</span>;
}

/** Spec: trade-watch-ratings. Side effects: none. */
function WatchRatings({ item }: { item: Watch }) {
  return <span style={{ display: 'grid', gap: 3 }} aria-label={`${item.name} 四维评分`}>{watchRatingFields.map(({ key, label }) => { const rating = item[key]; return <span style={{ display: 'grid', gridTemplateColumns: '64px 1fr', alignItems: 'center', gap: 4, color: 'var(--text-dim)', fontSize: 9.5 }} key={key}><span>{label}</span>{rating === undefined ? <small>未评分</small> : <span style={{ color: '#d97706', fontSize: 12, letterSpacing: 1, whiteSpace: 'nowrap' }} aria-label={`${label} ${rating} 星`}><span aria-hidden="true">{'★'.repeat(rating)}{'☆'.repeat(5 - rating)}</span></span>}</span>; })}</span>;
}

/** Specs: trade-watch-inline-management, trade-watch-tags, and trade-watch-ratings. Side effects: updates transient row state and delegates save/delete requests to the parent. */
function WatchRow({ item, onSave, onDelete }: { item: Watch; onSave: (watchId: string, draft: WatchDraft) => Promise<string | null>; onDelete: (watchId: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const createDraft = (): WatchDraft => ({ code: item.code, name: item.name, tags: item.tags.join('，'), optimisticTarget: item.optimisticTarget, target: item.target, pessimisticTarget: item.pessimisticTarget, safety: item.safety, ...Object.fromEntries(watchRatingFields.map(({ key }) => [key, item[key]])) });
  const [draft, setDraft] = useState<WatchDraft>(createDraft);
  const alert = priceAlert(item.current, item.target, item.safety);
  const alertClass = alert === 'target' ? 'alert-crimson' : alert === 'safety' ? 'alert-sky' : '';
  const cancel = () => { setDraft(createDraft()); setError(''); setEditing(false); };
  const setPrice = (field: 'optimisticTarget' | 'target' | 'pessimisticTarget' | 'safety', value: string) => setDraft((current) => ({ ...current, [field]: Number(value) }));
  const setRating = (key: WatchRatingKey, value: number | undefined) => setDraft((current) => { const next = { ...current }; if (value === undefined) delete next[key]; else next[key] = value; return next; });
  const save = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setError(''); setSaving(true); try { const reason = await onSave(item.id, { ...draft, code: draft.code.trim(), name: draft.name.trim() }); if (reason) setError(reason); else setEditing(false); } finally { setSaving(false); } };
  if (editing) return <form className="watch-row watch-row-editor" style={{ background: '#f8fafc' }} noValidate onSubmit={(event) => void save(event)} onChange={() => setError('')} onKeyDown={(event) => { if (event.key === 'Escape' && !saving) cancel(); }}>
    <span className="watch-identity-editor"><label className="sr-only" htmlFor={`watch-code-${item.id}`}>编辑 {item.name} 代码</label><input id={`watch-code-${item.id}`} value={draft.code} onChange={(event) => setDraft((current) => ({ ...current, code: event.target.value }))} inputMode="numeric" pattern="\d{5,6}" maxLength={6} autoFocus required /><label className="sr-only" htmlFor={`watch-name-${item.id}`}>编辑 {item.name} 名称</label><input id={`watch-name-${item.id}`} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} maxLength={100} required /><label className="sr-only" htmlFor={`watch-tags-${item.id}`}>编辑 {item.name} 标签</label><input id={`watch-tags-${item.id}`} style={{ gridColumn: '1 / -1' }} value={draft.tags} onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))} placeholder="标签（逗号分隔）" /></span>
    <label><span className="sr-only">编辑 {item.name} 乐观目标价</span><input type="number" min="0.01" step="0.01" value={draft.optimisticTarget} onChange={(event) => setPrice('optimisticTarget', event.target.value)} required /></label>
    <label><span className="sr-only">编辑 {item.name} 中枢目标价</span><input type="number" min="0.01" step="0.01" value={draft.target} onChange={(event) => setPrice('target', event.target.value)} required /></label>
    <label><span className="sr-only">编辑 {item.name} 悲观目标价</span><input type="number" min="0.01" step="0.01" value={draft.pessimisticTarget} onChange={(event) => setPrice('pessimisticTarget', event.target.value)} required /></label>
    <label style={{ display: 'grid', gap: 4, color: 'var(--text-dim)', fontSize: 10 }}><span>安全价</span><input aria-label={`编辑 ${item.name} 安全价`} type="number" min="0" step="0.01" value={draft.safety} onChange={(event) => setPrice('safety', event.target.value)} required /></label>
    <WatchRatingInputs itemName={item.name} values={draft} onChange={setRating} />
    <span className="watch-row-actions"><button type="submit" disabled={saving} aria-label={`保存 ${item.name} 观察标的`}>{saving ? '保存中…' : '保存'}</button><button type="button" disabled={saving} onClick={cancel} aria-label={`取消编辑 ${item.name} 观察标的`}>取消</button></span>
    {error && <span className="watch-row-error status-message" role="alert">{error}</span>}
  </form>;
  return <div className={`watch-row ${alert} ${alertClass}`.trim()}><span style={{ display: 'grid', gap: 5 }}><strong>{item.code} {item.name}{item.quoteAt && <small>新浪 · {item.quoteAt.replace('T', ' ')}</small>}</strong>{item.tags.length > 0 && <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }} aria-label={`${item.name} 标签`}>{item.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</span>}</span><span>¥{item.optimisticTarget}</span><span>¥{item.target}</span><span>¥{item.pessimisticTarget}</span><WatchCurrentPrice item={item} /><WatchRatings item={item} /><span className="watch-status-actions"><span className={`chip ${alert === 'target' ? 'crimson' : alert === 'safety' ? 'sky' : 'amber'}`}>{alert === 'target' ? '已达中枢目标价' : alert === 'safety' ? '已跌破安全价' : '观察中'}</span><span className="watch-row-actions"><button type="button" onClick={() => { setDraft(createDraft()); setError(''); setEditing(true); }} aria-label={`编辑 ${item.name} 观察标的`}>编辑</button><button type="button" className="danger" onClick={() => onDelete(item.id)} aria-label={`删除 ${item.name} 观察标的`}>删除</button></span></span></div>;
}
